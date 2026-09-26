#!/usr/bin/env tsx
/**
 * Horizon Audit — Variant B (Phase 4 recalibration)
 *
 * Аудит горизонта паттернов на реальных исторических данных.
 * Загружает 1m-свечи через существующий data-loader (Deriv для forex,
 * Binance для crypto), ресэмплирует в целевой таймфрейм, прогоняет
 * ВСЕ детекторы на каждой исторической свече и оценивает направленную
 * точность на нескольких горизонтах экспирации (expiryBars).
 *
 * Методология (direction-horizon-source-variant-B.md, раздел 3):
 *  1. Хронологическое разбиение: holdout (60/20/20) или walk-forward.
 *  2. Выбор лучшего expiryBars — ТОЛЬКО по train/validation данным.
 *  3. Финальная оценка — на отложённых test-данных (holdout) или
 *     агрегация по fold-level test-наблюдениям (walk-forward).
 *  4. Точный двусторонний биномиальный тест значимости против baseline=0.5
 *     (см. ./significance.ts) — формальный критерий, НЕ заменяется Wilson.
 *  5. Минимальный порог числа срабатываний — MIN_SAMPLES_FOR_SIGNIFICANCE
 *     (200, см. ./significance.ts).
 *  6. Предупреждение о множественных сравнениях (Holm-Bonferroni).
 *  7. Градуированный Wilson-критерий: нижняя граница интервала Уилсона
 *     даёт консервативную оценку надёжности, особенно на малых выборках,
 *     БЕЗ замены формального теста значимости. Паттерн может пройти
 *     Wilson-гейт, но не пройти формальный тест — и наоборот.
 *
 * Фаза 4 расширения:
 *  - Пулинг по нескольким инструментам (--symbols=EURUSD,USDJPY,...).
 *  - Глобальное разбиение по timestamp (не по barIndex внутри одного symbol).
 *  - Walk-forward режим (--split=walkforward) с purge-зазором между
 *    train/validation и test каждого fold.
 *  - Per-symbol breakdown в отчёте.
 *  - Wilson lower bound и passesWilsonGate в каждой строкке результата.
 *  - Метаданные пула (инструменты, корреляционное предупреждение).
 *
 * Использование:
 *   # Holdout, single symbol (обратно совместимо):
 *   npm run backtest:horizon-audit -- --symbol=EURUSD --timeframe=15m \
 *     --from=2026-06-16 --to=2026-09-16
 *
 *   # Pooled, walk-forward:
 *   npm run backtest:horizon-audit -- --symbols=EURUSD,USDJPY,GBPUSD \
 *     --timeframe=1m --from=2026-06-16 --to=2026-09-16 --split=walkforward
 */

import { fileURLToPath } from 'node:url';
import { writeFile, mkdir, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { loadHistory } from './data-loader';
import { isDerivSupported, isCrypto } from '@/data/symbols';
import { resample } from './resampler';
import { binomialSignificanceTest, MIN_SAMPLES_FOR_SIGNIFICANCE } from './significance';
import { wilsonLowerBound } from '@/lib/wilson';
import { breakevenWinRateFromProfitPercent, DEFAULT_PROFIT_PERCENT_FALLBACK } from '@/lib/pattern-reliability-calibration';
import {
  classifyDeduped,
  driftBaselineFromCounts,
  holmStepDown,
  requiredWinRateFor,
  type HorizonVerdict,
} from './horizon-verdict';
import { OCCURRENCE_ALGORITHM_VERSION, AUDIT_SCHEMA_VERSION } from './audit-version';
import { assignHoldoutPartitions, computeFoldBoundaries, assignFoldIndex, type FoldBoundary } from './horizon-partitioning';
import { detectAllPatterns } from '@/compute/patterns';
import { beginGateTrace, endGateTrace } from '@/compute/patterns/gate-trace';
import { beginDiagnosticTrace, endDiagnosticTrace, formatDiagnosticFunnel } from '@/compute/patterns/diagnostic-trace';
import { computeIndicatorSeriesRaw, snapshotFromSeries } from '@/compute/IndicatorAggregator';
import { readCache, writeCache, type CacheKey } from './occurrence-cache';
import { computeStructure } from '@/compute/indicators/trend-structure';
import { calcSmartMoney } from '@/compute/indicators/smart-money';
import { timeframeSchema, ALL_FEATURES, DEFAULT_INDICATOR_CONFIG, patternNameSchema } from '@/types/domain';
import type { Candle, Timeframe, PatternName, SignalDirection, FeatureName } from '@/types/domain';

// Версия алгоритма живёт в лёгком модуле (её читает и генератор таблицы);
// ре-экспорт сохраняет прежний путь импорта `from './horizon-audit'`.
export { OCCURRENCE_ALGORITHM_VERSION, AUDIT_SCHEMA_VERSION };

// ─── CLI ───────────────────────────────────────────────────────────

export interface CliArgs {
  symbols: string[];
  from: string;
  to: string;
  timeframe: string;
  outputDir: string;
  windowSize: number;
  minSamples: number;
  significanceAlpha: number;
  split: 'holdout' | 'walkforward';
  walkForwardFolds: number;
  purgeBars: number;
  wilsonMargin: number;
  /** Выплата бинарного контракта в % (как profitPercent демо-счёта). */
  payoutPercent: number;
  /**
   * 'pool'   — независимость считается ПО ВСЕМУ ПУЛУ (сигналы на разных
   *            инструментах в пределах горизонта — одно событие; BTC/ETH/SOL/BNB
   *            движутся почти синхронно). Консервативно, по умолчанию.
   * 'symbol' — независимость только внутри одного инструмента (прежнее поведение).
   */
  dedupeScope: DedupeScope;
  /**
   * 'live' — тот же набор индикаторов, что включён в приложении по умолчанию
   *          (ALL_INDICATOR_FEATURES); 'none' — только имена паттернов
   *          (прежнее поведение, для воспроизведения старых прогонов).
   */
  indicators: 'live' | 'none';
  /**
   * Считать «воронку» гейтов инструментированных детекторов (см.
   * src/compute/patterns/gate-trace.ts). Occurrence-кэш при этом
   * игнорируется при чтении — иначе детекторы не запускаются и счётчики
   * были бы неполными.
   */
  funnel: boolean;
}

export type DedupeScope = 'pool' | 'symbol';

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const map = new Map<string, string>();
  for (const arg of args) {
    const eqIdx = arg.indexOf('=');
    if (eqIdx > 0 && arg.startsWith('--')) {
      map.set(arg.slice(2, eqIdx), arg.slice(eqIdx + 1));
    } else if (eqIdx === -1 && arg.startsWith('--')) {
      // Булевый флаг без значения: --funnel
      map.set(arg.slice(2), 'true');
    }
  }
  const symbolArg = map.get('symbol');
  const symbolsArg = map.get('symbols');
  const symbols = symbolsArg
    ? symbolsArg.split(',').map((s) => s.trim()).filter(Boolean)
    : symbolArg
      ? [symbolArg]
      : ['EURUSD'];

  const splitArg = map.get('split') ?? 'holdout';

  // Некорректные значения НЕ откатываем молча на дефолт: разница между
  // «payout=80» и «payout=NaN → 80» в отчёте не видна, а меняет вердикт.
  const payoutRaw = map.get('payout');
  const payoutPercent = payoutRaw === undefined ? DEFAULT_PROFIT_PERCENT_FALLBACK : Number(payoutRaw);
  if (!Number.isFinite(payoutPercent) || payoutPercent <= 0) {
    console.error(`Invalid --payout=${payoutRaw}. Expected a positive number (percent), e.g. --payout=80.`);
    process.exit(1);
  }
  const dedupeArg = map.get('dedupe-scope') ?? 'pool';
  if (dedupeArg !== 'pool' && dedupeArg !== 'symbol') {
    console.error(`Invalid --dedupe-scope=${dedupeArg}. Valid: pool, symbol.`);
    process.exit(1);
  }
  const indicatorsArg = map.get('indicators') ?? 'live';
  if (indicatorsArg !== 'live' && indicatorsArg !== 'none') {
    console.error(`Invalid --indicators=${indicatorsArg}. Valid: live, none.`);
    process.exit(1);
  }
  return {
    symbols,
    from: map.get('from') ?? '2026-06-16',
    to: map.get('to') ?? '2026-09-16',
    timeframe: map.get('timeframe') ?? '15m',
    outputDir: map.get('output') ?? 'backtest/output',
    windowSize: parseInt(map.get('window') ?? '500', 10),
    minSamples: parseInt(map.get('min-samples') ?? '30', 10),
    significanceAlpha: parseFloat(map.get('alpha') ?? '0.05'),
    split: splitArg === 'walkforward' ? 'walkforward' : 'holdout',
    walkForwardFolds: parseInt(map.get('wf-folds') ?? '5', 10),
    purgeBars: parseInt(map.get('purge-bars') ?? '30', 10),
    wilsonMargin: parseFloat(map.get('wilson-margin') ?? '0.0'),
    payoutPercent,
    dedupeScope: dedupeArg,
    indicators: indicatorsArg,
    funnel: map.get('funnel') === 'true' || map.get('funnel') === '1',
  };
}

// ─── Pattern horizon grids (from pattern-audit-checklist-variant-B.md) ─

export const HORIZON_GRIDS: Record<string, number[]> = {
  'impulse-breakout': [1, 2, 3],
  'liquidity-sweep-reaction': [1, 2, 3],
  'order-block-continuation': [5, 10, 20, 30],
  'harmonic-pattern': [10, 20, 30],
  'strong-order-block-reaction': [1, 2, 3, 5, 10, 20, 30],
  'macd-deceleration-continuation': [5, 10, 20, 30],
  'fvg-return': [1, 2, 3, 5, 10, 20, 30],
  'fvg-rejection': [1, 2, 3, 5],
  'fvg-breaker-block': [5, 10, 20, 30],
  'fvg-nested': [5, 10, 20, 30],
  'order-block-breaker': [5, 10, 20, 30],
  'order-block-nested': [5, 10, 20, 30],
  'liquidity-sweep': [1, 2, 3],
  'hammer': [1, 2, 3, 5],
  'shooting-star': [1, 2, 3, 5],
  'inverted-hammer': [1, 2, 3, 5],
  'hanging-man': [1, 2, 3, 5],
  'marubozu-bullish': [1, 2, 3],
  'marubozu-bearish': [1, 2, 3],
  'bullish-engulfing': [1, 2, 3, 5],
  'bearish-engulfing': [1, 2, 3, 5],
  'bullish-harami': [2, 3, 5, 10],
  'bearish-harami': [2, 3, 5, 10],
  'piercing-line': [1, 2, 3, 5],
  'dark-cloud-cover': [1, 2, 3, 5],
  'tweezer-bottom': [1, 2, 3, 5],
  'tweezer-top': [1, 2, 3, 5],
  'morning-star': [3, 5, 10],
  'evening-star': [3, 5, 10],
  'three-white-soldiers': [3, 5, 10],
  'three-black-crows': [3, 5, 10],
  'abandoned-baby-bottom': [3, 5, 10],
  'abandoned-baby-top': [3, 5, 10],
  'pin-bar': [1, 2, 3, 5],
  'rising-three-methods': [10, 20, 30],
  'falling-three-methods': [10, 20, 30],
  'consolidation-breakout': [1, 2, 3, 5],
  'inside-bar': [1, 2, 3, 5],
  'mean-reversion': [5, 10, 15, 20],
};

const EXCLUDED_PATTERNS = new Set<PatternName>(['doji', 'spinning-top']);

/**
 * Набор фич, с которым аудит гоняет детекторы.
 *
 * Раньше activeFeatures состоял ТОЛЬКО из имён паттернов. Индикаторные фичи
 * ('bollinger', 'ema', 'macd', …) в снапшоте оставались null (см. needXxx в
 * IndicatorAggregator.ts), поэтому детекторы, которые их читают, в аудите
 * вели себя иначе, чем у пользователя: mean-reversion первой же строкой
 * возвращает null при bollingerUpper === null и физически не мог сработать.
 * У пользователя по умолчанию включены ВСЕ индикаторы
 * (settingsStore.ALL_INDICATOR_FEATURES) — аудит должен мерить то же самое.
 * Совпадение наборов закреплено тестом horizon-audit-features.test.ts.
 *
 * 'none' воспроизводит прежнее поведение (для сравнения со старыми отчётами).
 */
export function auditFeatureSet(mode: 'live' | 'none'): {
  patternFeatures: PatternName[];
  indicatorFeatures: FeatureName[];
  activeFeatures: FeatureName[];
} {
  const patternFeatures = ALL_FEATURES.filter(
    (f): f is PatternName => HORIZON_GRIDS[f as string] !== undefined && !EXCLUDED_PATTERNS.has(f as PatternName),
  );
  const allPatternNames = new Set<string>(patternNameSchema.options);
  const indicatorFeatures: FeatureName[] = mode === 'live' ? ALL_FEATURES.filter((f) => !allPatternNames.has(f)) : [];
  return { patternFeatures, indicatorFeatures, activeFeatures: [...patternFeatures, ...indicatorFeatures] };
}
// ─── Types ─────────────────────────────────────────────────────────

export interface Occurrence {
  patternName: PatternName;
  setupType: string | null;
  direction: SignalDirection;
  symbolId: string;
  barIndex: number;
  time: number;
  entryPrice: number;
  confidence: number;
  partition: 'train' | 'validation' | 'test';
  fold: number;
  outcomes: Map<number, number>;
}

interface PerSymbolStat {
  symbolId: string;
  totalOccurrences: number;
  testCount: number;
  testDecided: number;
  testAccuracy: number | null;
}

export interface PatternResult_ {
  patternName: PatternName;
  setupType: string | null;
  totalOccurrences: number;
  trainValCount: number;
  testCount: number;
  bestExpiryBars: number | null;
  testAccuracy: number | null;
  testWinCount: number | null;
  testDecidedCount: number | null;
  baselineMean: number | null;
  baselineStd: number | null;
  pValue: number | null;
  significant: boolean | null;
  wilsonLowerBound: number | null;
  passesWilsonGate: boolean | null;
  status: 'ok' | 'insufficient-data' | 'no-detections';
  /**
   * Сверка 2026-09-20: «независимые» наблюдения. Один экземпляр паттерна может
   * срабатывать на десятках подряд идущих баров (например, harmonic: пока точка D
   * «свежая», до ~30 баров), а горизонты экспирации перекрываются — обычный
   * биномиальный тест (pValue) считает такие наблюдения независимыми и завышает
   * значимость. Ниже — те же вычисления на дедуплицированном наборе (см.
   * dedupeOccurrences). Поля ТОЛЬКО ДОБАВЛЕНЫ; pValue/significant/Holm не менялись.
   */
  independentCount?: number | null;
  independentTestDecided?: number | null;
  testAccuracyDeduped?: number | null;
  pValueDeduped?: number | null;
  /**
   * Схема 2 (см. audit-version.ts, horizon-verdict.ts): вердикт строится по
   * ДЕДУПЛИЦИРОВАННЫМ наблюдениям. Поля выше (pValue/significant/
   * passesWilsonGate) остаются как «сырые» — для сравнения, на них решения
   * больше не принимаются.
   */
  independentTestWins?: number | null;
  wilsonLowerBoundDeduped?: number | null;
  passesWilsonGateDeduped?: boolean | null;
  /** Ожидаемая точность случайного направления с тем же buy/sell-миксом (дрейф). */
  driftBaseline?: number | null;
  /** max(безубыточность при payout, driftBaseline). */
  requiredWinRate?: number | null;
  /** Wilson LB (дедуп.) > requiredWinRate. */
  passesBreakevenGate?: boolean | null;
  /** Holm по дедуплицированному семейству p-value (только вверх). */
  significantDeduped?: boolean | null;
  verdict?: HorizonVerdict | null;
  verdictNote?: string | null;
  perSymbol: PerSymbolStat[];
  perExpiry: {
    expiryBars: number;
    trainValAccuracy: number;
    testAccuracy: number;
    testDecided: number;
  }[];
  /**
   * Только для walk-forward режима: по одной записи на каждый оценённый
   * fold (fold 0 пропускается — у него нет предыстории для train).
   * Диагностика: если bestExpiry заметно "прыгает" между фолдами — это
   * сигнал нестабильности выбора горизонта, а не единственное "истинное"
   * число.
   */
  perFold: {
    fold: number;
    trainCount: number;
    bestExpiryBars: number | null;
    testDecided: number;
    testWins: number;
  }[];
}

export interface PoolMeta {
  symbols: string[];
  split: 'holdout' | 'walkforward';
  walkForwardFolds: number;
  purgeBars: number;
  wilsonMargin: number;
  payoutPercent: number;
  breakevenRate: number;
  dedupeScope: DedupeScope;
  indicators: 'live' | 'none';
  indicatorCount: number;
  correlationWarning: string;
  perSymbolCandleCounts: { symbolId: string; candles1m: number; candlesResampled: number }[];
}

// ─── Core audit ─────────────────────────────────────────────────────

/**
 * A'.1-A'.2: индикаторы предвычисляются ОДИН раз причинной серией на весь
 * массив (computeIndicatorSeriesRaw) и берутся по индексу за O(1), вместо
 * пересчёта на windowSize-срезе на каждой итерации.
 *
 * Прежняя реализация (`computeIndicatorsSeries`, удалена) брала часть полей
 * — atr / adx / vwap / meanReversionRsi / impulseVelocity / volumeProfilePoc —
 * из `snapshot`, то есть из значения ПОСЛЕДНЕГО бара всего датасета, и
 * ставила его на каждый бар. Это look-ahead: бэктест видел будущее. При
 * наборе activeFeatures «только имена паттернов» большинство этих полей и так
 * было null, поэтому уже сохранённые отчёты пострадали только через
 * meanReversionRsi (детектор mean-reversion), но как ловушка это срабатывало
 * бы при первом же прогоне с индикаторными фичами. (С версии алгоритма 5
 * аудит по умолчанию считает live-набор индикаторов — см. auditFeatureSet().)
 *
 * A'.4: прогресс с ETA отдаётся через callback (по умолчанию — в консоль
 * каждые ~5%), чтобы «завис» отличалось от «считает ещё 40 минут».
 */
// Версия алгоритма buildOccurrences (OCCURRENCE_ALGORITHM_VERSION) и схемы
// выходного JSON (AUDIT_SCHEMA_VERSION) — в ./audit-version.ts (импортируются
// выше и ре-экспортируются отсюда). Входит в fingerprint кэша occurrences:
// любое изменение детекторов, набора индикаторов или правил разметки исходов
// ОБЯЗАНО сопровождаться инкрементом.


export function buildOccurrences(
  candles: Candle[],
  symbolId: string,
  activeFeatures: FeatureName[],
  config: typeof DEFAULT_INDICATOR_CONFIG,
  windowSize: number,
  maxExpiry: number,
  onProgress?: (current: number, total: number, elapsedMs: number) => void,
): Occurrence[] {
  const occurrences: Occurrence[] = [];
  const minStart = Math.max(windowSize, 50);
  const total = Math.max(0, candles.length - maxExpiry - minStart);
  const startedAt = Date.now();
  const reportEvery = Math.max(1, Math.floor(total / 20));
  let lastReport = -reportEvery;

  const report =
    onProgress ??
    ((current: number, totalBars: number, elapsedMs: number) => {
      const pct = totalBars > 0 ? (current / totalBars) * 100 : 100;
      const etaMs = current > 0 ? (elapsedMs / current) * Math.max(0, totalBars - current) : 0;
      console.log(
        `[buildOccurrences:${symbolId}] ${current}/${totalBars} (${pct.toFixed(1)}%) ` +
          `elapsed ${(elapsedMs / 1000).toFixed(0)}s ETA ${(etaMs / 1000).toFixed(0)}s occ=${occurrences.length}`,
      );
    });

  const indicatorSeries = computeIndicatorSeriesRaw(candles, config, activeFeatures);
  // D1: не блокируем крипто-паттерны по isAsiaOrClosed() — крипта торгуется
  // 24/7, а getSessionRegime() размечает 'closed'/'sydney'/'tokyo' по
  // форекс-календарю. См. PatternContext.sessionAgnostic в pattern-context.ts.
  const sessionAgnostic = isCrypto(symbolId);

  for (let i = minStart; i < candles.length - maxExpiry; i++) {
    const progressIdx = i - minStart;
    if (progressIdx - lastReport >= reportEvery) {
      lastReport = progressIdx;
      report(progressIdx, total, Date.now() - startedAt);
    }

    const window = candles.slice(i - windowSize + 1, i + 1);
    const snapshot = snapshotFromSeries(indicatorSeries, i);
    const structure = computeStructure(window, 50, true, config.atrPeriod);
    const smartMoney = calcSmartMoney(window);

    const patterns = detectAllPatterns(
      window,
      activeFeatures,
      snapshot,
      structure,
      smartMoney,
      config.atrPeriod,
      { fast: config.macdFast, slow: config.macdSlow, signal: config.macdSignal },
      {
        minLegAtr: config.harmonicMinLegAtr,
        fibTolerancePct: config.harmonicFibTolerancePct,
        htfFactor: config.harmonicHtfFactor,
      },
      undefined,
      sessionAgnostic,
    );

    const entryCandle = candles[i];

    for (const p of patterns) {
      if (EXCLUDED_PATTERNS.has(p.name)) continue;
      const grid = HORIZON_GRIDS[p.name];
      if (!grid) continue;

      const outcomes = new Map<number, number>();
      for (const expiry of grid) {
        if (i + expiry >= candles.length) {
          outcomes.set(expiry, 0);
          continue;
        }
        const expiryCandle = candles[i + expiry];
        const isBuy = p.direction === 'buy';
        if (expiryCandle.close === entryCandle.close) {
          outcomes.set(expiry, 0);
        } else {
          const win = isBuy
            ? expiryCandle.close > entryCandle.close
            : expiryCandle.close < entryCandle.close;
          outcomes.set(expiry, win ? 1 : -1);
        }
      }

      occurrences.push({
        patternName: p.name,
        setupType: p.setupType ?? null,
        direction: p.direction,
        symbolId,
        barIndex: i,
        time: entryCandle.time,
        entryPrice: entryCandle.close,
        confidence: p.confidence,
        partition: 'train',
        fold: 0,
        outcomes,
      });
    }
  }

  report(total, total, Date.now() - startedAt);
  return occurrences;
}

// ─── Accuracy computation ──────────────────────────────────────────
// Partitioning functions (assignHoldoutPartitions, computeFoldBoundaries,
// assignFoldIndex) are imported from ./horizon-partitioning.ts — extracted
// for testability. computeWalkForwardResult() (below) uses fold indices to
// perform genuine walk-forward evaluation.

/**
 * Досеивает в `groups` пустую группу (`<pattern>|`) для каждого паттерна из
 * `patternNames`, у которого нет НИ ОДНОЙ группы (ни одного срабатывания ни в
 * одном setupType). Такие группы дальше получают status 'no-detections'.
 */
export function seedNoDetectionGroups(groups: Map<string, Occurrence[]>, patternNames: readonly string[]): void {
  const withGroups = new Set([...groups.keys()].map((k) => k.split('|')[0]));
  for (const name of patternNames) {
    if (!withGroups.has(name)) groups.set(`${name}|`, []);
  }
}

/**
 * Дедупликация срабатываний (сверка 2026-09-20). В рамках одной связки
 * symbolId + direction (patternName/setupType уже одинаковы внутри группы) оставляет
 * первое срабатывание и пропускает последующие, пока расстояние в барах от
 * ПОСЛЕДНЕГО ОСТАВЛЕННОГО не превысит `minGapBars` (обычно — максимальный expiry
 * сетки паттерна: пока горизонт предыдущего наблюдения не закончился, следующее
 * не считается независимым). Порядок входа не важен. Occurrence-кэш и алгоритм
 * детекции не затрагиваются — это пост-обработка групп.
 */
export function dedupeOccurrences(occs: Occurrence[], minGapBars: number): Occurrence[] {
  const sorted = [...occs].sort((a, b) => {
    if (a.symbolId !== b.symbolId) return a.symbolId < b.symbolId ? -1 : 1;
    if (a.direction !== b.direction) return a.direction < b.direction ? -1 : 1;
    return a.barIndex - b.barIndex;
  });
  const kept: Occurrence[] = [];
  let lastKey = '';
  let lastKeptBar = -Infinity;
  for (const o of sorted) {
    const key = `${o.symbolId}|${o.direction}`;
    if (key !== lastKey) {
      lastKey = key;
      lastKeptBar = -Infinity;
    }
    if (o.barIndex - lastKeptBar > minGapBars) {
      kept.push(o);
      lastKeptBar = o.barIndex;
    }
  }
  return kept;
}

/**
 * Дедупликация ПО ВСЕМУ ПУЛУ инструментов (схема 2, --dedupe-scope=pool).
 *
 * dedupeOccurrences() выше считает независимость внутри одного инструмента.
 * Но пул BTCUSDT/ETHUSDT/SOLUSDT/BNBUSDT (и forex-пары с общей валютой)
 * движется почти синхронно: один и тот же сетап, сработавший на четырёх
 * инструментах в одну минуту, — не четыре независимых наблюдения, а одно
 * событие в четырёх копиях. Отчёт прямо предупреждает (correlationWarning),
 * что p-value не поправлен на межинструментную корреляцию; эта функция
 * закрывает именно эту дыру консервативно: в рамках одного направления
 * (buy/sell) наблюдения любых инструментов ближе minGapBars баров по
 * ВРЕМЕНИ от последнего оставленного считаются одним событием. Время, а не
 * barIndex — индексы разных инструментов после ресэмплинга не выровнены.
 *
 * Оставляется самое раннее наблюдение; при совпадении времени — по
 * алфавиту symbolId (детерминизм). Вход не мутируется.
 */
export function dedupeOccurrencesPooled(occs: Occurrence[], minGapBars: number, barSeconds: number): Occurrence[] {
  const minGapSec = minGapBars * barSeconds;
  const sorted = [...occs].sort((a, b) => {
    if (a.direction !== b.direction) return a.direction < b.direction ? -1 : 1;
    if (a.time !== b.time) return a.time - b.time;
    return a.symbolId < b.symbolId ? -1 : a.symbolId > b.symbolId ? 1 : 0;
  });
  const kept: Occurrence[] = [];
  let lastDir = '';
  let lastKeptTime = -Infinity;
  for (const o of sorted) {
    if (o.direction !== lastDir) {
      lastDir = o.direction;
      lastKeptTime = -Infinity;
    }
    if (o.time - lastKeptTime > minGapSec) {
      kept.push(o);
      lastKeptTime = o.time;
    }
  }
  return kept;
}

function dedupeForScope(occs: Occurrence[], scope: DedupeScope, minGapBars: number, barSeconds: number): Occurrence[] {
  return scope === 'pool' ? dedupeOccurrencesPooled(occs, minGapBars, barSeconds) : dedupeOccurrences(occs, minGapBars);
}

/**
 * Счётчики для дрейф-baseline на заданном горизонте: сколько решённых исходов,
 * сколько из них закончились РОСТОМ цены (независимо от направления сигнала)
 * и сколько сигналов были buy. См. driftBaselineFromCounts (horizon-verdict.ts).
 * Исход хранится относительно направления сигнала: buy+1 ⇒ цена выросла,
 * sell−1 ⇒ цена выросла.
 */
export function tallyDrift(occs: Occurrence[], expiry: number): { decided: number; rises: number; buys: number } {
  let decided = 0;
  let rises = 0;
  let buys = 0;
  for (const o of occs) {
    const out = o.outcomes.get(expiry);
    if (out === undefined || out === 0) continue;
    decided++;
    const isBuy = o.direction === 'buy';
    if (isBuy) buys++;
    if (isBuy ? out === 1 : out === -1) rises++;
  }
  return { decided, rises, buys };
}

export interface DedupedContext {
  alpha: number;
  /** Порог train-наблюдений на fold (как --min-samples в основном расчёте). */
  minTrainSamples: number;
  wilsonMargin: number;
  /** Безубыточная доля выигрышей при заданном payout. */
  breakevenRate: number;
  dedupeScope: DedupeScope;
  /** Длина бара в секундах (для временной дедупликации по пулу). */
  barSeconds: number;
}

export interface DedupedStats {
  independentCount: number;
  independentTestDecided: number;
  independentTestWins: number | null;
  testAccuracyDeduped: number | null;
  pValueDeduped: number | null;
  wilsonLowerBoundDeduped: number | null;
  passesWilsonGateDeduped: boolean | null;
  driftBaseline: number | null;
  requiredWinRate: number | null;
  passesBreakevenGate: boolean | null;
}

function finalizeDedupedStats(
  independentCount: number,
  decided: number,
  wins: number,
  drift: { decided: number; rises: number; buys: number },
  ctx: DedupedContext,
): DedupedStats {
  const empty: DedupedStats = {
    independentCount,
    independentTestDecided: decided,
    independentTestWins: null,
    testAccuracyDeduped: null,
    pValueDeduped: null,
    wilsonLowerBoundDeduped: null,
    passesWilsonGateDeduped: null,
    driftBaseline: null,
    requiredWinRate: null,
    passesBreakevenGate: null,
  };
  // Порог тот же, что у основного теста: меньше 200 независимых решённых
  // исходов — p-value не считается (binomialSignificanceTest вернул бы NaN),
  // вердикт по такому паттерну — «недостаточно независимых наблюдений».
  if (decided < MIN_SAMPLES_FOR_SIGNIFICANCE) return empty;

  const lb = wilsonLowerBound(wins, decided);
  const driftBaseline = driftBaselineFromCounts(drift.decided, drift.rises, drift.buys);
  const requiredWinRate = requiredWinRateFor(ctx.breakevenRate, driftBaseline);
  return {
    independentCount,
    independentTestDecided: decided,
    independentTestWins: wins,
    testAccuracyDeduped: wins / decided,
    pValueDeduped: binomialSignificanceTest(wins, decided, 0.5, ctx.alpha).pValue,
    wilsonLowerBoundDeduped: lb,
    passesWilsonGateDeduped: lb >= 0.5 + ctx.wilsonMargin,
    driftBaseline,
    requiredWinRate,
    passesBreakevenGate: lb > requiredWinRate,
  };
}

/**
 * Дедуплицированная статистика walk-forward для группы одного паттерна.
 * Дедупликация — ДО разбиения на train/test (и train, и test состоят из
 * независимых наблюдений); лучший expiry на каждом fold заново выбирается по
 * дедуплицированному train — это самостоятельная оценка, а не пересчёт
 * сырой. Дрейф-baseline считается ровно по тем же наблюдениям и горизонтам
 * (по expiry, выбранному на каждом fold), что вошли в aggregatedDecided.
 */
export function computeDedupedStatsWalkForward(
  groupOccs: Occurrence[],
  grid: number[],
  foldBoundaries: FoldBoundary[],
  purgeSeconds: number,
  ctx: DedupedContext,
): DedupedStats {
  const deduped = dedupeForScope(groupOccs, ctx.dedupeScope, Math.max(...grid), ctx.barSeconds);
  const wf = computeWalkForwardResult(deduped, grid, foldBoundaries, purgeSeconds, ctx.minTrainSamples);
  const drift = { decided: 0, rises: 0, buys: 0 };
  for (const f of wf.perFold) {
    if (f.bestExpiryBars === null) continue;
    const t = tallyDrift(deduped.filter((o) => o.fold === f.fold), f.bestExpiryBars);
    drift.decided += t.decided;
    drift.rises += t.rises;
    drift.buys += t.buys;
  }
  return finalizeDedupedStats(deduped.length, wf.aggregatedDecided, wf.aggregatedWins, drift, ctx);
}

/** Holdout-вариант: expiry выбирается по дедуплицированному train+val, оценка — на дедуплицированном test. */
export function computeDedupedStatsHoldout(
  groupOccs: Occurrence[],
  grid: number[],
  ctx: DedupedContext,
): DedupedStats {
  const deduped = dedupeForScope(groupOccs, ctx.dedupeScope, Math.max(...grid), ctx.barSeconds);
  const tvD = deduped.filter((o) => o.partition !== 'test');
  const tcD = deduped.filter((o) => o.partition === 'test');
  const bestD = selectBestExpiry(tvD, grid);
  if (!bestD) return finalizeDedupedStats(deduped.length, 0, 0, { decided: 0, rises: 0, buys: 0 }, ctx);
  const testD = accuracyForExpiry(tcD, bestD.bestExpiry);
  return finalizeDedupedStats(deduped.length, testD.decided, testD.wins, tallyDrift(tcD, bestD.bestExpiry), ctx);
}

type VerdictTarget = Pick<
  PatternResult_,
  | 'status'
  | 'testAccuracyDeduped'
  | 'pValueDeduped'
  | 'wilsonLowerBoundDeduped'
  | 'requiredWinRate'
  | 'significantDeduped'
  | 'verdict'
  | 'verdictNote'
>;

/**
 * Проставляет significantDeduped (Holm по дедуплицированному семейству) и
 * вердикт каждому результату. Для status !== 'ok' всё остаётся null — по
 * таким паттернам вердикта нет (нет данных / нет срабатываний).
 */
export function applyDedupedVerdicts(
  results: VerdictTarget[],
  opts: { alpha: number; wilsonMargin: number },
): void {
  const ok = results.filter((r) => r.status === 'ok');
  const holm = holmStepDown(
    ok.map((r) => ({ pValue: r.pValueDeduped ?? null, accuracy: r.testAccuracyDeduped ?? null })),
    opts.alpha,
  );
  ok.forEach((r, k) => {
    r.significantDeduped = holm[k];
    const v = classifyDeduped({
      testAccuracyDeduped: r.testAccuracyDeduped ?? null,
      pValueDeduped: r.pValueDeduped ?? null,
      significantDeduped: r.significantDeduped ?? null,
      wilsonLowerBoundDeduped: r.wilsonLowerBoundDeduped ?? null,
      requiredWinRate: r.requiredWinRate ?? null,
      wilsonMargin: opts.wilsonMargin,
      alpha: opts.alpha,
    });
    r.verdict = v.status;
    r.verdictNote = v.note;
  });
  for (const r of results) {
    if (r.status === 'ok') continue;
    r.significantDeduped = null;
    r.verdict = null;
    r.verdictNote = null;
  }
}

export function accuracyForExpiry(
  occs: Occurrence[],
  expiry: number,
): { accuracy: number; decided: number; wins: number } {
  let wins = 0;
  let decided = 0;
  for (const o of occs) {
    const out = o.outcomes.get(expiry);
    if (out === undefined) continue;
    if (out === 0) continue;
    decided++;
    if (out === 1) wins++;
  }
  return { accuracy: decided > 0 ? wins / decided : 0, decided, wins };
}

export function selectBestExpiry(
  trainVal: Occurrence[],
  grid: number[],
): { bestExpiry: number; bestAccuracy: number } | null {
  let bestExpiry = grid[0];
  let bestAccuracy = -1;
  for (const expiry of grid) {
    const { accuracy, decided } = accuracyForExpiry(trainVal, expiry);
    if (decided === 0) continue;
    if (accuracy > bestAccuracy) {
      bestAccuracy = accuracy;
      bestExpiry = expiry;
    }
  }
  if (bestAccuracy < 0) return null;
  return { bestExpiry, bestAccuracy };
}

/**
 * Настоящая walk-forward оценка (слияние 2026-09-17, заменяет прежнюю
 * реализацию через assignWalkForwardPartitions, которая не аккумулировала
 * предыдущие folds как train — см. header-комментарий horizon-partitioning.ts).
 *
 * Для каждого fold k = 1..folds-1 (fold 0 пропускается — нет предыстории):
 *   train = все occurrences этой группы паттерна из folds < k,
 *           с purge-отступом перед границей fold k (occurrences, чей
 *           expiry мог бы "заехать" за границу, исключены из train);
 *   test  = occurrences fold k;
 *   bestExpiry этого fold выбирается ТОЛЬКО по train этого fold
 *           (см. Фаза 3 промта, п.2 — выбор не должен подглядывать в test);
 *   исход на test для выбранного bestExpiry аккумулируется в общий пул.
 *
 * Итоговый значимый тест считается на АГРЕГИРОВАННОМ по всем оценённым
 * folds пуле (wins/decided) — это и даёт обещанный ~4-кратный прирост
 * эффективной test-выборки по сравнению с одиночным holdout (95% данных
 * участвует как test хотя бы одного fold, а не только последние 20%).
 */
export function computeWalkForwardResult(
  groupOccs: Occurrence[],
  grid: number[],
  foldBoundaries: FoldBoundary[],
  purgeSeconds: number,
  minTrainSamples: number,
): {
  perFold: PatternResult_['perFold'];
  aggregatedWins: number;
  aggregatedDecided: number;
  totalTrainCount: number;
  modalBestExpiry: number | null;
} {
  const perFold: PatternResult_['perFold'] = [];
  let aggregatedWins = 0;
  let aggregatedDecided = 0;
  let totalTrainCount = 0;
  const expiryVotes = new Map<number, number>();

  for (let k = 1; k < foldBoundaries.length; k++) {
    const purgeCutoff = foldBoundaries[k].start - purgeSeconds;
    const trainOccs = groupOccs.filter((o) => o.fold < k && o.time <= purgeCutoff);
    const testOccs = groupOccs.filter((o) => o.fold === k);

    if (trainOccs.length < minTrainSamples || testOccs.length === 0) {
      perFold.push({ fold: k, trainCount: trainOccs.length, bestExpiryBars: null, testDecided: 0, testWins: 0 });
      continue;
    }

    const best = selectBestExpiry(trainOccs, grid);
    if (!best) {
      perFold.push({ fold: k, trainCount: trainOccs.length, bestExpiryBars: null, testDecided: 0, testWins: 0 });
      continue;
    }

    const testRes = accuracyForExpiry(testOccs, best.bestExpiry);
    perFold.push({
      fold: k,
      trainCount: trainOccs.length,
      bestExpiryBars: best.bestExpiry,
      testDecided: testRes.decided,
      testWins: testRes.wins,
    });

    aggregatedWins += testRes.wins;
    aggregatedDecided += testRes.decided;
    totalTrainCount += trainOccs.length;
    expiryVotes.set(best.bestExpiry, (expiryVotes.get(best.bestExpiry) ?? 0) + 1);
  }

  let modalBestExpiry: number | null = null;
  let modalVotes = -1;
  for (const [expiry, votes] of expiryVotes) {
    if (votes > modalVotes) {
      modalVotes = votes;
      modalBestExpiry = expiry;
    }
  }

  return { perFold, aggregatedWins, aggregatedDecided, totalTrainCount, modalBestExpiry };
}

/**
 * BUGFIX (ревизия слияния 2026-09-18) — две ошибки в одной функции:
 *
 * 1. Затиралось направленное условие. binomialSignificanceTest() определяет
 *    significant как «p < alpha И accuracy > baseline» (см. significance.ts,
 *    SignificanceResult.significant). Прежняя версия присваивала
 *    `significant = pValue <= threshold`, теряя вторую половину, — и паттерн,
 *    значимо ХУЖЕ случайного, помечался significant=true. Реальный пример в
 *    backtest/output: impulse-breakout на BTCUSDT/ETHUSDT, accuracy 46.3%,
 *    p=0.0061 → significant: true.
 *
 * 2. Не было шага вниз (step-down). Процедура Холма отвергает гипотезы по
 *    возрастанию p, и ПРИ ПЕРВОМ НЕОТВЕРЖЕНИИ останавливается: все
 *    последующие тоже не отвергаются. Прежняя версия проверяла каждую
 *    позицию независимо, из-за чего гипотеза с бОльшим p могла оказаться
 *    «значимой» после неотвергнутой с меньшим p.
 *
 * Уже сохранённые отчёты в backtest/output пересчитать нельзя, поэтому
 * generate-pattern-horizon-table.ts перепроверяет направление сам.
 */
function holmBonferroni(
  results: PatternResult_[],
  alpha: number,
  baseline = 0.5,
): void {
  // Логика вынесена в чистую holmStepDown (horizon-verdict.ts), чтобы одна и
  // та же процедура применялась и к сырым, и к дедуплицированным p-value.
  // Поведение прежнее: семейство — результаты с p-value; у прочих
  // significant не трогается.
  const flags = holmStepDown(
    results.map((r) => ({ pValue: r.pValue, accuracy: r.testAccuracy })),
    alpha,
    baseline,
  );
  results.forEach((r, k) => {
    if (flags[k] !== null) r.significant = flags[k];
  });
}

// ─── Report generation ──────────────────────────────────────────────

/**
 * Воронка гейтов в виде markdown-строк. Ключ счётчика — `детектор:NN-этап`
 * (см. src/compute/patterns/gate-trace.ts): значение — сколько раз кандидат
 * ДОШЁЛ до этапа (прошёл все предыдущие проверки). «Отсеяно на этом гейте» —
 * разница с предыдущим этапом того же детектора.
 */
export function formatGateFunnel(counts: Record<string, number>): string[] {
  const byDetector = new Map<string, [string, number][]>();
  for (const [key, count] of Object.entries(counts)) {
    const idx = key.indexOf(':');
    const detector = idx === -1 ? key : key.slice(0, idx);
    const stage = idx === -1 ? '' : key.slice(idx + 1);
    if (!byDetector.has(detector)) byDetector.set(detector, []);
    byDetector.get(detector)!.push([stage, count]);
  }
  const lines: string[] = [];
  for (const detector of [...byDetector.keys()].sort()) {
    const stages = byDetector.get(detector)!.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    const evaluated = stages[0][1];
    lines.push(`### ${detector}`, '', '| Этап (кандидат дошёл до) | Дошло | % от вызовов | Отсеяно на этом гейте |', '|---|---|---|---|');
    let prev: number | null = null;
    for (const [stage, count] of stages) {
      const pct = evaluated > 0 ? `${((count / evaluated) * 100).toFixed(3)}%` : '—';
      lines.push(`| ${stage} | ${count} | ${pct} | ${prev === null ? '—' : prev - count} |`);
      prev = count;
    }
    lines.push('');
  }
  return lines;
}

export function generateMarkdown(
  args: CliArgs,
  poolMeta: PoolMeta,
  candles1mTotal: number,
  candlesTotal: number,
  results: PatternResult_[],
  dateRange: { from: string; to: string },
  gateFunnel?: Record<string, number>,
  diagnosticFunnel?: Record<string, number>,
): string {
  const lines: string[] = [];
  const symbolsStr = args.symbols.join(', ');
  lines.push(`# Horizon Audit — ${symbolsStr} ${args.timeframe}`);
  lines.push('');
  lines.push(`> Сгенерировано: ${new Date().toISOString()}`);
  lines.push(`> Период: ${dateRange.from} → ${dateRange.to}`);
  lines.push(`> Инструменты (пул): ${symbolsStr}`);
  // Сверка 2026-09-20: метка источника по реальному маршруту loadHistory
  // (isDerivSupported проверяется первым — BTC/ETH/SOL/BNB идут через Deriv, а не Binance).
  const sourceLabels = [...new Set(args.symbols.map((sym) => (isDerivSupported(sym) ? 'Deriv WebSocket' : 'Binance REST')))];
  lines.push(`> Источник: ${sourceLabels.join(' + ')} (1m candles → resampled to ${args.timeframe})`);
  if (args.split === 'walkforward') {
    lines.push(`> Разбиение: walk-forward, ${args.walkForwardFolds} folds, purge ${args.purgeBars} bars`);
  } else {
    lines.push(`> Разбиение: train 60% / validation 20% / test 20% (хронологическое, глобальное по timestamp)`);
  }
  lines.push(`> Минимальный порог (train+validation): ${args.minSamples} срабатываний`);
  lines.push(`> Минимальный порог для теста значимости (test-выборка): ${MIN_SAMPLES_FOR_SIGNIFICANCE} решённых исходов`);
  lines.push(`> Значимость: точный двусторонний биномиальный тест против baseline=0.5, с поправкой Holm-Bonferroni, α = ${args.significanceAlpha}`);
  lines.push(`> Wilson-критерий: нижняя граница 95% интервала Уилсона ≥ ${(0.5 + args.wilsonMargin).toFixed(3)} (margin=${args.wilsonMargin})`);
  lines.push(`> **Вердикт** (схема ${AUDIT_SCHEMA_VERSION}): по ДЕДУПЛИЦИРОВАННЫМ независимым наблюдениям (--dedupe-scope=${poolMeta.dedupeScope}); Holm по дедуплицированному семейству; допуск ('valid') требует нижней границы Уилсона выше max(безубыточность, дрейф-baseline).`);
  lines.push(`> Выплата (payout): ${poolMeta.payoutPercent}% → безубыточная доля выигрышей ${(poolMeta.breakevenRate * 100).toFixed(2)}%`);
  lines.push(`> Индикаторы: --indicators=${poolMeta.indicators} (${poolMeta.indicatorCount} шт.); версия алгоритма occurrences: ${OCCURRENCE_ALGORITHM_VERSION}`);
  lines.push('');
  lines.push(`**Загружено**: ${candles1mTotal} 1m свечей (суммарно по пулу), ${candlesTotal} ${args.timeframe} свечей после ресэмплинга.`);
  lines.push('');

  // Pool metadata
  lines.push(`## Метаданные пула`);
  lines.push('');
  lines.push(`| Инструмент | 1m свечей | ${args.timeframe} свечей |`);
  lines.push('|---|---|---|');
  for (const p of poolMeta.perSymbolCandleCounts) {
    lines.push(`| ${p.symbolId} | ${p.candles1m} | ${p.candlesResampled} |`);
  }
  lines.push('');
  lines.push(`> **Предупреждение о корреляции**: ${poolMeta.correlationWarning}`);
  lines.push('');

  const significantCount = results.filter((r) => r.significant === true).length;
  const wilsonPassCount = results.filter((r) => r.passesWilsonGate === true).length;
  const validCount = results.filter((r) => r.verdict === 'valid').length;
  const rejectedCount = results.filter((r) => r.verdict === 'rejected').length;
  const significantDedupedCount = results.filter((r) => r.significantDeduped === true).length;
  const belowBreakevenCount = results.filter(
    (r) => r.significantDeduped === true && r.passesWilsonGateDeduped === true && r.passesBreakevenGate !== true,
  ).length;
  const insufficientCount = results.filter((r) => r.status === 'insufficient-data').length;
  const noDetectionCount = results.filter((r) => r.status === 'no-detections').length;

  lines.push(`## Сводка`);
  lines.push('');
  lines.push(`- Паттернов в сетке: ${results.length}`);
  lines.push(`- **Вердикт valid** (дедуп. + Holm + Wilson + безубыточность ${(poolMeta.breakevenRate * 100).toFixed(2)}%): **${validCount}**`);
  lines.push(`- Вердикт rejected (значимо ХУЖЕ 50% на независимых наблюдениях): ${rejectedCount}`);
  lines.push(`- Значимых вверх по дедуп. (Holm), но не выше безубыточности: ${belowBreakevenCount}`);
  lines.push(`- Значимых вверх по дедуп. (Holm), всего: ${significantDedupedCount}`);
  lines.push(`- Для сравнения — значимых по СЫРЫМ наблюдениям (Holm, без дедупа): ${significantCount}; прошли сырой Wilson-гейт: ${wilsonPassCount}`);
  lines.push(`- Недостаточно данных: ${insufficientCount}`);
  lines.push(`- Нет срабатываний: ${noDetectionCount}`);
  lines.push('');

  const bothPass = results.filter((r) => r.significant === true && r.passesWilsonGate === true).length;
  const sigOnly = results.filter((r) => r.significant === true && r.passesWilsonGate !== true).length;
  const wilsonOnly = results.filter((r) => r.significant !== true && r.passesWilsonGate === true).length;
  if (bothPass + sigOnly + wilsonOnly > 0) {
    lines.push(`### Пересечение критериев`);
    lines.push('');
    lines.push(`- Прошли оба (формальный + Wilson): ${bothPass}`);
    lines.push(`- Только формальный тест: ${sigOnly}`);
    lines.push(`- Только Wilson-гейт: ${wilsonOnly}`);
    lines.push('');
  }

  lines.push(`## Результаты по паттернам`);
  lines.push('');
  // В walk-forward это СУММА размеров expanding-train по фолдам (одно и то же
  // наблюдение считается в train многих фолдов), поэтому может превышать «Всего».
  const trainColumn = args.split === 'walkforward' ? 'Σ train по фолдам' : 'Train+Val';
  // «Независимых (все фолды)» — число дедуплицированных наблюдений по всей
  // истории (train+test); «Независ. test» — решённые независимые исходы, на
  // которых считается вердикт.
  lines.push(`| Паттерн | Setup | Всего | ${trainColumn} | Test | Независ. (все) | Независ. test | Лучший expiry | Test acc | p-value | Acc дедуп. | p (дедуп.) | Значим (сырой) | Значим (дедуп.) | Wilson LB | Wilson LB дедуп. | Нужно > | Вердикт | Статус |`);
  lines.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');

  for (const r of results) {
    const setup = r.setupType ?? '—';
    const total = r.totalOccurrences;
    const tv = r.trainValCount;
    const tc = r.testCount;
    const exp = r.bestExpiryBars ?? '—';
    const acc = r.testAccuracy !== null ? `${(r.testAccuracy * 100).toFixed(1)}%` : '—';
    const pv = r.pValue !== null ? r.pValue.toFixed(4) : '—';
    const indep = r.independentCount != null ? String(r.independentCount) : '—';
    const indepTest = r.independentTestDecided != null ? String(r.independentTestDecided) : '—';
    const accD = r.testAccuracyDeduped != null ? `${(r.testAccuracyDeduped * 100).toFixed(1)}%` : '—';
    const pvD = r.pValueDeduped != null ? r.pValueDeduped.toFixed(4) : '—';
    const sig = r.significant === true ? 'да' : r.significant === false ? 'нет' : '—';
    const sigD = r.significantDeduped === true ? 'да' : r.significantDeduped === false ? 'нет' : '—';
    const wlb = r.wilsonLowerBound !== null ? `${(r.wilsonLowerBound * 100).toFixed(1)}%` : '—';
    const wlbD = r.wilsonLowerBoundDeduped != null ? `${(r.wilsonLowerBoundDeduped * 100).toFixed(1)}%` : '—';
    const need = r.requiredWinRate != null ? `${(r.requiredWinRate * 100).toFixed(1)}%` : '—';
    const verdictCell = r.verdict ? (r.verdictNote ? `${r.verdict} (${r.verdictNote})` : r.verdict) : '—';
    // Значимо ХУЖЕ случайного (анти-сигнал): колонка «Значим» проверяет только
    // превышение 50%, поэтому p≈0 при accuracy < 50% выглядел как «нет».
    const worseThanRandom = r.status === 'ok' && r.pValue !== null && r.pValue < args.significanceAlpha
      && r.testAccuracy !== null && r.testAccuracy < 0.5;
    const status = r.status === 'ok'
      ? (worseThanRandom ? 'OK (значимо ХУЖЕ 50%)' : 'OK')
      : r.status === 'insufficient-data' ? 'недостаточно данных' : 'нет срабатываний';
    lines.push(`| ${r.patternName} | ${setup} | ${total} | ${tv} | ${tc} | ${indep} | ${indepTest} | ${exp} | ${acc} | ${pv} | ${accD} | ${pvD} | ${sig} | ${sigD} | ${wlb} | ${wlbD} | ${need} | ${verdictCell} | ${status} |`);
  }

  if (gateFunnel && Object.keys(gateFunnel).length > 0) {
    lines.push('');
    lines.push(`## Воронка гейтов (инструментированные детекторы)`);
    lines.push('');
    lines.push('> Сколько баров дошло до каждого этапа детектора; разница соседних строк — отсев на этом гейте. Покрыты только детекторы с вызовами `gate()` (hammer, inverted-hammer, hanging-man, shooting-star, mean-reversion); остальные в воронке не участвуют. Счётчики — суммарно по пулу, за весь период (не только test).');
    lines.push('');
    lines.push(...formatGateFunnel(gateFunnel));
  }

  if (diagnosticFunnel && Object.keys(diagnosticFunnel).length > 0) {
    lines.push('');
    lines.push('> D3 (промт "Исправление по воронке гейтов", п.6-7): `htf-seen-*`/`htf-pass-*` — сколько кандидатов hammer-семейства дошло до финальной проверки confidence и сколько из них её прошло, в разбивке по классу множителя `htfAlignment()` (1.00-bos / 0.75-choch / 0.40-range / other=0.5). `05a-band-exit-only-*`/`05b-band-exit-and-rsi-*` — та же геометрия mean-reversion (вышел за полосу BB и вернулся), раздельно БЕЗ требования по RSI(7) и С ним — раньше это была одна склеенная стадия `05-band-exit-rsi`. Чисто измерительные счётчики, ни на что не влияют.');
    lines.push('');
    lines.push(...formatDiagnosticFunnel(diagnosticFunnel));
  }

  // Per-symbol breakdown
  lines.push('');
  lines.push(`## Разбивка по инструментам`);
  lines.push('');
  for (const r of results) {
    if (r.perSymbol.length === 0) continue;
    lines.push(`### ${r.patternName}${r.setupType ? ` (${r.setupType})` : ''}`);
    lines.push('');
    lines.push('| Инструмент | Всего | Test | Test decided | Test accuracy |');
    lines.push('|---|---|---|---|---|');
    for (const ps of r.perSymbol) {
      const psAcc = ps.testAccuracy !== null ? `${(ps.testAccuracy * 100).toFixed(1)}%` : '—';
      lines.push(`| ${ps.symbolId} | ${ps.totalOccurrences} | ${ps.testCount} | ${ps.testDecided} | ${psAcc} |`);
    }
    lines.push('');
  }

  lines.push(`## Детализация по горизонтам`);
  lines.push('');

  for (const r of results) {
    if (r.perExpiry.length === 0) continue;
    lines.push(`### ${r.patternName}${r.setupType ? ` (${r.setupType})` : ''}`);
    lines.push('');
    lines.push('| Expiry bars | Train+Val accuracy | Test accuracy | Test decided |');
    lines.push('|---|---|---|---|');
    for (const pe of r.perExpiry) {
      lines.push(`| ${pe.expiryBars} | ${(pe.trainValAccuracy * 100).toFixed(1)}% | ${(pe.testAccuracy * 100).toFixed(1)}% | ${pe.testDecided} |`);
    }
    lines.push('');
  }

  if (args.split === 'walkforward') {
    lines.push(`## Разбивка по folds (walk-forward)`);
    lines.push('');
    lines.push(
      `> Если \`bestExpiryBars\` заметно меняется между folds — это признак нестабильности выбора ` +
      `горизонта для этого паттерна, а не единственное "истинное" число. Итоговый \`bestExpiryBars\` ` +
      `в сводной таблице выше — мода (самый частый выбор) по всем оценённым folds.`,
    );
    lines.push('');
    for (const r of results) {
      if (r.perFold.length === 0) continue;
      lines.push(`### ${r.patternName}${r.setupType ? ` (${r.setupType})` : ''}`);
      lines.push('');
      lines.push('| Fold | Train count | Best expiry | Test decided | Test wins | Fold accuracy |');
      lines.push('|---|---|---|---|---|---|');
      for (const pf of r.perFold) {
        const foldAcc = pf.testDecided > 0 ? `${((pf.testWins / pf.testDecided) * 100).toFixed(1)}%` : '—';
        lines.push(`| ${pf.fold} | ${pf.trainCount} | ${pf.bestExpiryBars ?? 'пропущен (мало train)'} | ${pf.testDecided} | ${pf.testWins} | ${foldAcc} |`);
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}

// ─── Main ───────────────────────────────────────────────────────────

/**
 * Прогресс-чекпойнт: после каждого обработанного паттерна на диск атомарно
 * (tmp + rename) пишутся уже готовые строки результата. Раньше итоговый
 * отчёт писался ровно один раз, в самом конце main(), после того как
 * обработаны ВСЕ паттерны по ВСЕМ символам — обрыв на статистическом
 * расчёте (после уже успешной, дорогой загрузки свечей) означал ноль
 * сохранённых данных. Теперь при сбое можно посмотреть <baseName>.progress.json
 * и увидеть, что уже посчитано. При успешном завершении прогона черновик
 * удаляется — финальный .json/.md остаются единственным источником правды.
 */
async function writeProgressCheckpoint(outputDir: string, baseName: string, results: PatternResult_[]): Promise<void> {
  const path = join(outputDir, `${baseName}.progress.json`);
  const tmp = `${path}.tmp`;
  const payload = {
    status: 'in-progress',
    updatedAt: new Date().toISOString(),
    patternsProcessed: results.length,
    results,
  };
  try {
    await mkdir(outputDir, { recursive: true });
    await writeFile(tmp, JSON.stringify(payload, null, 2), 'utf-8');
    await rename(tmp, path);
  } catch (err) {
    // Чекпойнт — это диагностика, а не критичная часть прогона: сбой его
    // записи не должен ронять сам расчёт.
    console.warn(`  [checkpoint] failed to write progress checkpoint: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function clearProgressCheckpoint(outputDir: string, baseName: string): Promise<void> {
  try {
    await unlink(join(outputDir, `${baseName}.progress.json`));
  } catch {
    // Файла могло не быть (прогон без единого промежуточного чекпойнта) — не ошибка.
  }
}

export async function main(): Promise<void> {
  const args = parseArgs();

  const tfResult = timeframeSchema.safeParse(args.timeframe);
  if (!tfResult.success) {
    console.error(`Invalid timeframe: ${args.timeframe}. Valid: ${timeframeSchema.options.join(', ')}`);
    process.exit(1);
  }
  const timeframe: Timeframe = tfResult.data;

  const fromMs = new Date(args.from).getTime();
  const toMs = new Date(args.to).getTime();
  if (Number.isNaN(fromMs) || Number.isNaN(toMs)) {
    console.error('Invalid date format. Use YYYY-MM-DD.');
    process.exit(1);
  }
  if (fromMs >= toMs) {
    console.error('--from must be before --to');
    process.exit(1);
  }

  console.log(`\nHorizon Audit: ${args.symbols.join(', ')} ${args.timeframe} ${args.from} → ${args.to}`);
  console.log(`Split mode: ${args.split}${args.split === 'walkforward' ? `, ${args.walkForwardFolds} folds, purge=${args.purgeBars} bars` : ''}`);

  const symbolsSlug = args.symbols.join('-');
  const baseName = `horizon-audit-${symbolsSlug}-${args.timeframe}-${args.split}-${args.from}-${args.to}`;

  // Load history for each symbol in the pool
  const { patternFeatures, indicatorFeatures, activeFeatures } = auditFeatureSet(args.indicators);
  console.log(`Feature set: ${patternFeatures.length} patterns + ${indicatorFeatures.length} indicators (--indicators=${args.indicators})`);

  const breakevenRate = breakevenWinRateFromProfitPercent(args.payoutPercent);
  console.log(`Payout ${args.payoutPercent}% → breakeven win rate ${(breakevenRate * 100).toFixed(2)}%; dedupe scope: ${args.dedupeScope}`);

  const config = { ...DEFAULT_INDICATOR_CONFIG };
  const maxExpiry = Math.max(...Object.values(HORIZON_GRIDS).flat());

  const allOccurrences: Occurrence[] = [];
  const perSymbolCandleCounts: PoolMeta['perSymbolCandleCounts'] = [];
  let totalCandles1m = 0;
  let totalCandlesResampled = 0;

  if (args.funnel) beginGateTrace();
  // D3: тот же флаг --funnel включает и независимый диагностический канал
  // (diagnostic-trace.ts) — см. его комментарий насчёт того, почему это не
  // те же счётчики, что gateFunnel.
  if (args.funnel) beginDiagnosticTrace();

  for (const symbolId of args.symbols) {
    // Occurrence-кэш проверяется ДО любого сетевого запроса. Раньше
    // loadHistory() вызывался безусловно первой строкой цикла — даже с
    // тёплым occurrence-кэшем (паттерны для символа уже посчитаны в
    // прошлом прогоне) процесс всё равно уходил в сеть за часами истории,
    // а результат просто выбрасывался. Ключ кэша не зависит от самих
    // свечей (только от символа/диапазона/конфига/версии алгоритма),
    // поэтому его можно построить и проверить до loadHistory.
    const cacheKey: CacheKey = {
      symbol: symbolId,
      timeframe,
      from: args.from,
      to: args.to,
      windowSize: args.windowSize,
      maxExpiry,
      activeFeatures,
      config,
      algorithmVersion: OCCURRENCE_ALGORITHM_VERSION,
    };
    // --funnel: кэш не читаем — при попадании детекторы не запускаются и
    // воронка гейтов осталась бы неполной.
    const cached = args.funnel ? null : await readCache(cacheKey);

    if (cached) {
      console.log(`\n${symbolId}: occurrence cache hit — skipping network entirely (${cached.occurrences.length} occurrences, ${cached.candleCounts.candles1m} 1m candles at cache time)`);
      perSymbolCandleCounts.push({
        symbolId,
        candles1m: cached.candleCounts.candles1m,
        candlesResampled: cached.candleCounts.candlesResampled,
      });
      totalCandles1m += cached.candleCounts.candles1m;
      totalCandlesResampled += cached.candleCounts.candlesResampled;
      allOccurrences.push(...cached.occurrences);
      continue;
    }

    console.log(`\nLoading 1m history for ${symbolId}...`);
    const { candles: candles1mRaw, truncatedByIterationCap: trunc1m } = await loadHistory({ symbol: symbolId, fromMs, toMs });
    const candles1m = candles1mRaw;
    console.log(`  ${symbolId}: ${candles1m.length} 1m candles${trunc1m ? ' [TRUNCATED]' : ''}`);

    if (candles1m.length < 500) {
      console.warn(`  ${symbolId}: skipping — not enough 1m candles (need at least 500)`);
      perSymbolCandleCounts.push({ symbolId, candles1m: candles1m.length, candlesResampled: 0 });
      continue;
    }

    const candles = resample(candles1m, timeframe);
    console.log(`  ${symbolId}: ${candles.length} ${timeframe} candles after resampling`);

    if (candles.length < 200) {
      console.warn(`  ${symbolId}: skipping — not enough resampled candles (need at least 200)`);
      perSymbolCandleCounts.push({ symbolId, candles1m: candles1m.length, candlesResampled: candles.length });
      continue;
    }

    perSymbolCandleCounts.push({ symbolId, candles1m: candles1m.length, candlesResampled: candles.length });
    totalCandles1m += candles1m.length;
    totalCandlesResampled += candles.length;

    console.log(`  ${symbolId}: running detectors on ${candles.length - maxExpiry - args.windowSize} bars...`);
    const occs = buildOccurrences(candles, symbolId, activeFeatures, config, args.windowSize, maxExpiry);
    await writeCache(cacheKey, occs, { candles1m: candles1m.length, candlesResampled: candles.length });
    console.log(`  ${symbolId}: ${occs.length} occurrences (calculated)`);
    allOccurrences.push(...occs);
  }

  const gateFunnel: Record<string, number> | undefined = args.funnel
    ? Object.fromEntries([...endGateTrace()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
    : undefined;
  const diagnosticFunnel: Record<string, number> | undefined = args.funnel
    ? Object.fromEntries([...endDiagnosticTrace()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
    : undefined;

  if (allOccurrences.length === 0) {
    console.error('No occurrences detected across any symbol. Exiting.');
    process.exit(1);
  }

  // Partition
  const timeframeSecondsMap: Record<Timeframe, number> = {
    '1m': 60, '5m': 300, '15m': 900, '30m': 1800, '1h': 3600, '4h': 14400, '1d': 86400,
  };
  const dedupedCtx: DedupedContext = {
    alpha: args.significanceAlpha,
    minTrainSamples: args.minSamples,
    wilsonMargin: args.wilsonMargin,
    breakevenRate,
    dedupeScope: args.dedupeScope,
    barSeconds: timeframeSecondsMap[timeframe],
  };
  let foldBoundaries: FoldBoundary[] = [];
  let purgeSeconds = 0;
  if (args.split === 'walkforward') {
    purgeSeconds = args.purgeBars * timeframeSecondsMap[timeframe];
    let minTime = Infinity;
    let maxTime = -Infinity;
    for (const o of allOccurrences) {
      if (o.time < minTime) minTime = o.time;
      if (o.time > maxTime) maxTime = o.time;
    }
    foldBoundaries = computeFoldBoundaries(minTime, maxTime, args.walkForwardFolds);
    assignFoldIndex(allOccurrences, foldBoundaries);
    console.log(`\nWalk-forward: ${args.walkForwardFolds} folds, purge ${args.purgeBars} bars (${purgeSeconds}s)`);
    console.log(`Fold boundaries (unix seconds): ${foldBoundaries.map((b) => `[${b.start.toFixed(0)}, ${b.end.toFixed(0)})`).join(', ')}`);
  } else {
    assignHoldoutPartitions(allOccurrences);
  }

  console.log(`\nTotal occurrences: ${allOccurrences.length}`);
  if (args.split === 'walkforward') {
    const warmup = allOccurrences.filter((o) => o.fold === 0).length;
    const eligible = allOccurrences.length - warmup;
    console.log(`Fold 0 (warm-up, no test): ${warmup}, eligible for test in some fold (fold>=1): ${eligible}`);
  } else {
    const trainVal = allOccurrences.filter((o) => o.partition === 'train' || o.partition === 'validation');
    const test = allOccurrences.filter((o) => o.partition === 'test');
    console.log(`Train+Validation: ${trainVal.length}, Test: ${test.length}`);
  }

  // Group by pattern + setupType
  const groupKey = (o: Occurrence) => `${o.patternName}|${o.setupType ?? ''}`;
  const groups = new Map<string, Occurrence[]>();
  for (const o of allOccurrences) {
    const key = groupKey(o);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(o);
  }

  // Сверка 2026-09-20: groups строятся ТОЛЬКО из встреченных occurrences, поэтому
  // паттерны с нулём срабатываний молча исчезали из отчёта (и «Нет срабатываний»
  // всегда было 0). Досеиваем пустые группы для каждого реально оценивавшегося
  // паттерна без единого срабатывания — они получают status 'no-detections'.
  seedNoDetectionGroups(groups, patternFeatures);

  const results: PatternResult_[] = [];
  for (const [key, groupOccs] of groups) {
    const [patternName, setupTypeStr] = key.split('|');
    const setupType = setupTypeStr || null;
    const grid = HORIZON_GRIDS[patternName];
    if (!grid) continue;

    const isWalkForward = args.split === 'walkforward';

    // Для holdout — привычные tv/tc по o.partition (не изменилось).
    // Для walk-forward — эти переменные используются только для
    // диагностической таблицы perExpiry ниже (fold 0 = "разогревочный"
    // train без собственного test, fold>=1 = пул, который хотя бы раз
    // выступал test каким-то fold'ом). ОСНОВНОЙ результат (bestExpiryBars,
    // testAccuracy, pValue и т.д.) для walk-forward считает
    // computeWalkForwardResult() ниже — эти tv/tc его не подменяют.
    const tv = isWalkForward
      ? groupOccs.filter((o) => o.fold === 0)
      : groupOccs.filter((o) => o.partition !== 'test');
    const tc = isWalkForward
      ? groupOccs.filter((o) => o.fold >= 1)
      : groupOccs.filter((o) => o.partition === 'test');

    // Per-symbol stats
    const symbolMap = new Map<string, Occurrence[]>();
    for (const o of groupOccs) {
      if (!symbolMap.has(o.symbolId)) symbolMap.set(o.symbolId, []);
      symbolMap.get(o.symbolId)!.push(o);
    }
    const perSymbol: PerSymbolStat[] = [];
    for (const [symId, symOccs] of symbolMap) {
      const symTest = isWalkForward
        ? symOccs.filter((o) => o.fold >= 1)
        : symOccs.filter((o) => o.partition === 'test');
      perSymbol.push({
        symbolId: symId,
        totalOccurrences: symOccs.length,
        testCount: symTest.length,
        testDecided: 0,
        testAccuracy: null,
      });
    }
    perSymbol.sort((a, b) => b.totalOccurrences - a.totalOccurrences);

    const result: PatternResult_ = {
      patternName: patternName as PatternName,
      setupType,
      totalOccurrences: groupOccs.length,
      trainValCount: tv.length,
      testCount: tc.length,
      bestExpiryBars: null,
      testAccuracy: null,
      testWinCount: null,
      testDecidedCount: null,
      baselineMean: null,
      baselineStd: null,
      pValue: null,
      significant: null,
      wilsonLowerBound: null,
      passesWilsonGate: null,
      status: 'no-detections',
      perSymbol,
      perExpiry: [],
      perFold: [],
    };

    if (groupOccs.length === 0) {
      results.push(result);
      await writeProgressCheckpoint(args.outputDir, baseName, results);
      continue;
    }

    // Дешёвый предфильтр перед дорогим вычислением. Для holdout — как и
    // раньше, по размеру train+val (tv). Для walk-forward tv — это ТОЛЬКО
    // fold 0 (разогрев), а не совокупный train — гейтить по нему было бы
    // некорректно: поздние folds накапливают историю независимо от того,
    // достаточно ли данных в fold 0 самом по себе. Гейтим по общему числу
    // occurrences паттерна — дешёвый sanity-check, а не финальное решение
    // (финальное — внутри computeWalkForwardResult, по каждому fold отдельно).
    const preFilterSize = isWalkForward ? groupOccs.length : tv.length;
    if (preFilterSize < args.minSamples) {
      result.status = 'insufficient-data';
      for (const expiry of grid) {
        const tvAcc = accuracyForExpiry(tv, expiry);
        const tAcc = accuracyForExpiry(tc, expiry);
        result.perExpiry.push({
          expiryBars: expiry,
          trainValAccuracy: tvAcc.accuracy,
          testAccuracy: tAcc.accuracy,
          testDecided: tAcc.decided,
        });
      }
      results.push(result);
      await writeProgressCheckpoint(args.outputDir, baseName, results);
      continue;
    }

    for (const expiry of grid) {
      const tvAcc = accuracyForExpiry(tv, expiry);
      const tAcc = accuracyForExpiry(tc, expiry);
      result.perExpiry.push({
        expiryBars: expiry,
        trainValAccuracy: tvAcc.accuracy,
        testAccuracy: tAcc.accuracy,
        testDecided: tAcc.decided,
      });
    }

    if (isWalkForward) {
      const wf = computeWalkForwardResult(groupOccs, grid, foldBoundaries, purgeSeconds, args.minSamples);
      result.perFold = wf.perFold;
      result.trainValCount = wf.totalTrainCount;

      if (wf.modalBestExpiry === null || wf.aggregatedDecided === 0) {
        result.status = 'insufficient-data';
        results.push(result);
        await writeProgressCheckpoint(args.outputDir, baseName, results);
        continue;
      }

      result.bestExpiryBars = wf.modalBestExpiry;
      result.testDecidedCount = wf.aggregatedDecided;
      result.testCount = wf.aggregatedDecided;
      result.testWinCount = wf.aggregatedWins;
      result.testAccuracy = wf.aggregatedWins / wf.aggregatedDecided;

      result.wilsonLowerBound = wilsonLowerBound(wf.aggregatedWins, wf.aggregatedDecided);
      result.passesWilsonGate = result.wilsonLowerBound >= 0.5 + args.wilsonMargin;

      // Per-symbol breakdown: приближение через modalBestExpiry (разные
      // folds могли выбрать разный expiry — см. комментарий у perFold в
      // PatternResult_). Это диагностика, не основной результат.
      for (const ps of result.perSymbol) {
        const symFoldTest = symbolMap.get(ps.symbolId)!.filter((o) => o.fold >= 1);
        const symAcc = accuracyForExpiry(symFoldTest, wf.modalBestExpiry);
        ps.testDecided = symAcc.decided;
        ps.testAccuracy = symAcc.decided > 0 ? symAcc.accuracy : null;
      }

      if (wf.aggregatedDecided < MIN_SAMPLES_FOR_SIGNIFICANCE) {
        result.status = 'insufficient-data';
        results.push(result);
        await writeProgressCheckpoint(args.outputDir, baseName, results);
        continue;
      }

      const sig = binomialSignificanceTest(wf.aggregatedWins, wf.aggregatedDecided, 0.5, args.significanceAlpha);
      result.baselineMean = sig.baseline;
      result.baselineStd = null;
      result.pValue = sig.pValue;
      result.status = 'ok';

      // Дедуплицированная версия того же walk-forward: на ней (а не на сырой)
      // принимается вердикт — см. computeDedupedStatsWalkForward /
      // applyDedupedVerdicts и horizon-verdict.ts.
      Object.assign(result, computeDedupedStatsWalkForward(groupOccs, grid, foldBoundaries, purgeSeconds, dedupedCtx));

      results.push(result);
      await writeProgressCheckpoint(args.outputDir, baseName, results);
      continue;
    }

    const best = selectBestExpiry(tv, grid);
    if (!best) {
      result.status = 'insufficient-data';
      results.push(result);
      await writeProgressCheckpoint(args.outputDir, baseName, results);
      continue;
    }

    result.bestExpiryBars = best.bestExpiry;
    const testResult = accuracyForExpiry(tc, best.bestExpiry);
    result.testAccuracy = testResult.accuracy;
    result.testDecidedCount = testResult.decided;
    result.testWinCount = testResult.decided > 0
      ? Math.round(testResult.accuracy * testResult.decided)
      : 0;

    // Wilson lower bound (graduated reliability criterion)
    if (testResult.decided > 0) {
      result.wilsonLowerBound = wilsonLowerBound(result.testWinCount, testResult.decided);
      result.passesWilsonGate = result.wilsonLowerBound >= 0.5 + args.wilsonMargin;
    }

    // Update per-symbol test stats for the best expiry
    for (const ps of result.perSymbol) {
      const symTest = symbolMap.get(ps.symbolId)!.filter((o) => o.partition === 'test');
      const symAcc = accuracyForExpiry(symTest, best.bestExpiry);
      ps.testDecided = symAcc.decided;
      ps.testAccuracy = symAcc.decided > 0 ? symAcc.accuracy : null;
    }

    if (testResult.decided < MIN_SAMPLES_FOR_SIGNIFICANCE) {
      result.status = 'insufficient-data';
      results.push(result);
      await writeProgressCheckpoint(args.outputDir, baseName, results);
      continue;
    }

    const sig = binomialSignificanceTest(
      result.testWinCount,
      testResult.decided,
      0.5,
      args.significanceAlpha,
    );
    result.baselineMean = sig.baseline;
    result.baselineStd = null;
    result.pValue = sig.pValue;
    result.status = 'ok';

    // Дедуплицированная версия: expiry заново выбирается на дедуплицированном
    // train+val, тест — на дедуплицированном test (см. computeDedupedStatsHoldout).
    Object.assign(result, computeDedupedStatsHoldout(groupOccs, grid, dedupedCtx));

    results.push(result);
    await writeProgressCheckpoint(args.outputDir, baseName, results);
  }

  // Сырая Holm-поправка — только для сравнения с прошлыми отчётами.
  holmBonferroni(results, args.significanceAlpha);
  // Решение принимается здесь: Holm по дедуплицированному семейству + вердикт
  // (значимость вверх, Wilson, безубыточность при payout).
  applyDedupedVerdicts(results, { alpha: args.significanceAlpha, wilsonMargin: args.wilsonMargin });

  const verdictRank = (r: PatternResult_) => (r.verdict === 'valid' ? 0 : r.significantDeduped === true ? 1 : 2);
  results.sort((a, b) => {
    const rd = verdictRank(a) - verdictRank(b);
    if (rd !== 0) return rd;
    const aAcc = a.testAccuracyDeduped ?? a.testAccuracy ?? -1;
    const bAcc = b.testAccuracyDeduped ?? b.testAccuracy ?? -1;
    return bAcc - aAcc;
  });

  // Correlation warning
  const dedupeNote = args.dedupeScope === 'pool'
    ? "Вердикт строится по дедуплицированным наблюдениям с независимостью ПО ВСЕМУ ПУЛУ (--dedupe-scope=pool): сигналы разных инструментов в пределах горизонта считаются одним событием — это консервативная поправка на межинструментную корреляцию."
    : "Вердикт строится по дедуплицированным наблюдениям с независимостью только ВНУТРИ инструмента (--dedupe-scope=symbol): корреляция между инструментами при этом НЕ учтена.";
  const correlationWarning = args.symbols.length > 1
    ? `Пул содержит ${args.symbols.length} инструментов. Корреляция между инструментами (особенно forex-парами с общей валютой и крипто-парами к USDT) может завышать эффективный размер выборки. Сырой p-value НЕ корректируется на межинструментную корреляцию — он оставлен только для сравнения с прошлыми отчётами. ${dedupeNote}`
    : `Один инструмент — межинструментная корреляция не применима. ${dedupeNote}`;

  const poolMeta: PoolMeta = {
    symbols: args.symbols,
    split: args.split,
    walkForwardFolds: args.walkForwardFolds,
    purgeBars: args.purgeBars,
    wilsonMargin: args.wilsonMargin,
    payoutPercent: args.payoutPercent,
    breakevenRate,
    dedupeScope: args.dedupeScope,
    indicators: args.indicators,
    indicatorCount: indicatorFeatures.length,
    correlationWarning,
    perSymbolCandleCounts,
  };

  const md = generateMarkdown(args, poolMeta, totalCandles1m, totalCandlesResampled, results, {
    from: args.from,
    to: args.to,
  }, gateFunnel, diagnosticFunnel);

  await mkdir(args.outputDir, { recursive: true });

  const mdPath = join(args.outputDir, `${baseName}.md`);
  const jsonPath = join(args.outputDir, `${baseName}.json`);

  await writeFile(mdPath, md, 'utf-8');
  // Расследование "algorithmVersion: 6 в отчёте, но такой версии нет ни в
  // одном коммите" (промт, продолжение): единственный способ поймать это
  // сразу — писать в сам отчёт, с какого коммита он реально сгенерирован.
  // В GitHub Actions GITHUB_SHA выставляется платформой автоматически и
  // указывает именно на чекаутнутый workflow_dispatch реф; git rev-parse —
  // фолбэк для локального запуска (npm run backtest:horizon-audit без CI).
  // 'unknown' — если ни то, ни другое недоступно (например, .git отсутствует
  // в артефакте) — сознательно не бросаем исключение из-за одного лишь
  // отсутствия трассируемости.
  let commitHash = process.env.GITHUB_SHA ?? null;
  if (!commitHash) {
    try {
      commitHash = execSync('git rev-parse HEAD', { cwd: fileURLToPath(new URL('.', import.meta.url)) })
        .toString()
        .trim();
    } catch {
      commitHash = 'unknown';
    }
  }
  await writeFile(
    jsonPath,
    JSON.stringify({
      meta: {
        symbols: args.symbols,
        timeframe: args.timeframe,
        from: args.from,
        to: args.to,
        split: args.split,
        walkForwardFolds: args.walkForwardFolds,
        purgeBars: args.purgeBars,
        wilsonMargin: args.wilsonMargin,
        candles1mTotal: totalCandles1m,
        candlesResampledTotal: totalCandlesResampled,
        windowSize: args.windowSize,
        minSamples: args.minSamples,
        minSamplesForSignificance: MIN_SAMPLES_FOR_SIGNIFICANCE,
        alpha: args.significanceAlpha,
        // Схема 2: вердикт по дедуплицированным наблюдениям с проверкой
        // безубыточности. Генератор runtime-таблицы по этим полям отличает
        // новые отчёты от legacy и находит устаревшие (algorithmVersion).
        auditSchemaVersion: AUDIT_SCHEMA_VERSION,
        algorithmVersion: OCCURRENCE_ALGORITHM_VERSION,
        commitHash,
        payoutPercent: args.payoutPercent,
        breakevenRate,
        dedupeScope: args.dedupeScope,
        indicators: args.indicators,
        generatedAt: new Date().toISOString(),
      },
      poolMeta,
      ...(gateFunnel ? { gateFunnel } : {}),
      ...(diagnosticFunnel ? { diagnosticFunnel } : {}),
      results: results.map((r) => ({
        patternName: r.patternName,
        setupType: r.setupType,
        totalOccurrences: r.totalOccurrences,
        trainValCount: r.trainValCount,
        testCount: r.testCount,
        bestExpiryBars: r.bestExpiryBars,
        testAccuracy: r.testAccuracy,
        testWinCount: r.testWinCount,
        testDecidedCount: r.testDecidedCount,
        baselineMean: r.baselineMean,
        baselineStd: r.baselineStd,
        pValue: r.pValue,
        significant: r.significant,
        wilsonLowerBound: r.wilsonLowerBound,
        passesWilsonGate: r.passesWilsonGate,
        status: r.status,
        independentCount: r.independentCount ?? null,
        independentTestDecided: r.independentTestDecided ?? null,
        testAccuracyDeduped: r.testAccuracyDeduped ?? null,
        pValueDeduped: r.pValueDeduped ?? null,
        independentTestWins: r.independentTestWins ?? null,
        wilsonLowerBoundDeduped: r.wilsonLowerBoundDeduped ?? null,
        passesWilsonGateDeduped: r.passesWilsonGateDeduped ?? null,
        driftBaseline: r.driftBaseline ?? null,
        requiredWinRate: r.requiredWinRate ?? null,
        passesBreakevenGate: r.passesBreakevenGate ?? null,
        significantDeduped: r.significantDeduped ?? null,
        verdict: r.verdict ?? null,
        verdictNote: r.verdictNote ?? null,
        perSymbol: r.perSymbol,
        perExpiry: r.perExpiry,
        perFold: r.perFold,
      })),
    }, null, 2),
    'utf-8',
  );

  await clearProgressCheckpoint(args.outputDir, baseName);

  console.log(`\nReport saved: ${mdPath}`);
  console.log(`JSON saved: ${jsonPath}`);

  const valid = results.filter((r) => r.verdict === 'valid');
  const rejected = results.filter((r) => r.verdict === 'rejected');
  const sigRaw = results.filter((r) => r.significant === true);
  const insuf = results.filter((r) => r.status === 'insufficient-data');
  console.log(`\n=== Summary ===`);
  console.log(`Patterns evaluated: ${results.length}`);
  console.log(`Verdict valid (dedup + Holm α=${args.significanceAlpha} + Wilson + breakeven ${(breakevenRate * 100).toFixed(2)}%): ${valid.length}`);
  console.log(`Verdict rejected (significantly below 50% on independent observations): ${rejected.length}`);
  console.log(`For comparison — significant on RAW (non-deduplicated) observations: ${sigRaw.length}`);
  console.log(`Insufficient data: ${insuf.length}`);
  if (valid.length > 0) {
    console.log(`\nValid patterns:`);
    for (const r of valid) {
      console.log(
        `  ${r.patternName}${r.setupType ? ` (${r.setupType})` : ''}: ` +
        `expiry=${r.bestExpiryBars}, accuracy(dedup)=${((r.testAccuracyDeduped ?? 0) * 100).toFixed(1)}%, ` +
        `p(dedup)=${r.pValueDeduped?.toFixed(4)}, wilsonLB(dedup)=${r.wilsonLowerBoundDeduped != null ? (r.wilsonLowerBoundDeduped * 100).toFixed(1) + '%' : '—'}, ` +
        `required>${r.requiredWinRate != null ? (r.requiredWinRate * 100).toFixed(1) + '%' : '—'}`,
      );
    }
  }
  const rawOnly = sigRaw.filter((r) => r.verdict !== 'valid');
  if (rawOnly.length > 0) {
    console.log(`\nSignificant on raw observations but NOT valid after deduplication/breakeven:`);
    for (const r of rawOnly) {
      console.log(
        `  ${r.patternName}${r.setupType ? ` (${r.setupType})` : ''}: raw accuracy=${((r.testAccuracy ?? 0) * 100).toFixed(1)}%, ` +
        `raw p=${r.pValue?.toFixed(4)}, independent test n=${r.independentTestDecided ?? '—'}, verdict=${r.verdict ?? '—'}${r.verdictNote ? ` (${r.verdictNote})` : ''}`,
      );
    }
  }
}

// BUGFIX (слияние 2026-09-17): main() раньше вызывался безусловно на
// верхнем уровне модуля — любой `import` из этого файла (например, из
// теста, который хочет переиспользовать exported-функции вроде
// computeWalkForwardResult) запускал бы весь CLI: парсинг process.argv,
// реальные сетевые запросы к Deriv/Binance, возможный process.exit().
// Гвардим тем же паттерном, что и `if (require.main === module)` в
// CommonJS — только для ESM, через сравнение fileURLToPath(import.meta.url)
// с process.argv[1] (путь запущенного скрипта).
const isDirectRun = (() => {
  try {
    return process.argv[1] === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
})();

if (isDirectRun) {
  main().then(() => { process.exit(0); }).catch((err: unknown) => {
    console.error('Horizon audit failed:', err instanceof Error ? err.message : String(err));
    if (err instanceof Error && err.stack) {
      console.error(err.stack);
    }
    process.exit(1);
  });
}
