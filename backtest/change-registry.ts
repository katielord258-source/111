import { wilsonLowerBound, breakevenWinRateFromProfitPercent } from '@/lib/pattern-reliability-calibration';
import { MIN_THRESHOLD_BACKTEST_SAMPLES } from '@/lib/threshold-calibration';
import { computeMetrics, type BacktestMetrics } from './metrics';
import type { SimulatedTrade } from './simulator';

// Аудит 2026-09-13, п.5 ("проверка на переобучение через сам процесс
// аудита"): у backtest/simulator.ts уже был in-sample/out-of-sample split
// (inSampleRatio) — но это разбиение ВНУТРИ ОДНОГО статического
// исторического файла свечей. Это не защищает от главного риска ручного
// аудита: правку (breakeven-константа, спред-паритет, Wilson-граница —
// см. LOGIC_CHANGE_LOG ниже) можно перегонять через npm run backtest
// сколько угодно раз, подбирая параметры так, чтобы OOS-часть ТОГО ЖЕ
// файла выглядела хорошо, — это researcher degrees of freedom / проблема
// множественного тестирования, тот же оверфиттинг, только на один уровень
// абстракции выше. Настоящая защита — WALL-CLOCK forward-test: правило
// считается подтверждённым только на сделках, ВРЕМЯ ВХОДА которых позже
// момента, когда правило было заморожено (frozenAtMs) — то есть на
// данных, которые физически не могли использоваться при разработке этой
// же правки, сколько бы раз её ни перезапускали на старых файлах.
//
// См. docs/audit/WALK_FORWARD_PROTOCOL.md — полное описание протокола и
// правила добавления новых записей сюда.

export interface LogicChangeRecord {
  /** Короткий стабильный идентификатор правки (совпадает с её changelog-файлом). */
  id: string;
  /** Дата в формате YYYY-MM-DD — только для человекочитаемости отчётов. */
  date: string;
  description: string;
  filesChanged: string[];
  /**
   * Wall-clock момент (мс, UTC), после которого правка считается
   * "заморожена". НЕЛЬЗЯ датировать задним числом — при следующей правке
   * той же логики это значение переносится на новый момент деплоя, а не
   * остаётся прежним (см. протокол).
   */
  frozenAtMs: number;
}

// Записи ниже соответствуют трём правкам, уже применённым и
// задокументированным в docs/changelog/ за 2026-09-13 (одна и та же
// сессия аудита — отсюда одинаковая дата заморозки у всех трёх).
export const LOGIC_CHANGE_LOG: LogicChangeRecord[] = [
  {
    id: 'breakeven-payout-aware',
    date: '2026-09-13',
    description:
      'BREAKEVEN_WIN_RATE выведен из profitPercent демо-счёта (100/(100+profitPercent)) вместо хардкода 0.5.',
    filesChanged: ['src/lib/pattern-reliability-calibration.ts', 'src/ui/CalibrationPanel.tsx'],
    frozenAtMs: Date.UTC(2026, 8, 13),
  },
  {
    id: 'spread-balance-parity',
    date: '2026-09-13',
    description:
      'resolveTrade() в useDemoAccountStore.ts теперь применяет спред-логику (движение <= спред → тай) к самому балансу, а не только к обучающей метке калибровки.',
    filesChanged: ['src/stores/useDemoAccountStore.ts'],
    frozenAtMs: Date.UTC(2026, 8, 13),
  },
  {
    id: 'wilson-min-samples',
    date: '2026-09-13',
    description:
      'computeReliabilitySuggestions считает множитель от нижней границы интервала Уилсона, а не от сырого winRate; MIN_FACTOR_SAMPLES поднят с 5 до 20.',
    filesChanged: ['src/lib/pattern-reliability-calibration.ts', 'src/ui/factor-analytics.ts'],
    frozenAtMs: Date.UTC(2026, 8, 13),
  },
  {
    id: 'audit-review-fixes',
    date: '2026-09-20',
    description:
      'Сверка по итогам отчётов A′.5: зеркальная симметрия sell-подтверждения (weakClose); объёмные гейты пропускаются при volume≡0 (engulfing, piercing, dark-cloud, morning/evening-star, abandoned-baby, consolidation-breakout) — пороги при реальном объёме не менялись; pin-bar: htfStructure + направленная близость к swing; таблица горизонтов перегенерирована по прогону A′.5; опциональный режим requireHorizonEvidence (по умолчанию выключен). OCCURRENCE_ALGORITHM_VERSION поднят с 3 до 4 — правки детекторов меняют состав detectAllPatterns, поэтому старый occurrence-кэш версии 3 молча отдавал бы результаты прежних детекторов. ВАЖНО: frozenAtMs — день фактического деплоя; при деплое позже 2026-09-20 перенести на реальную дату (задним числом датировать нельзя).',
    filesChanged: [
      'src/compute/patterns/pattern-context.ts',
      'src/compute/patterns/double.ts',
      'src/compute/patterns/triple.ts',
      'src/compute/patterns/consolidation-breakout.ts',
      'src/compute/patterns/pin-bar.ts',
      'src/decision/pattern-horizon-table.ts',
      'src/decision/signal-builder.ts',
      'src/decision/engine.ts',
      'backtest/horizon-audit.ts',
    ],
    // Перенесено на день фактического деплоя (2026-09-21) вместе с horizon-table-schema2: правки 2026-09-20
    // в приложение до этого дня не попадали, датировать их задним числом нельзя.
    frozenAtMs: Date.UTC(2026, 8, 21),
  },
  {
    id: 'horizon-table-schema2',
    date: '2026-09-21',
    description:
      'Таблица горизонтов перегенерирована по отчётам аудита схемы 2 (дедуплицированные наблюдения, безубыточность при payout 80%, версия алгоритма occurrences 5, полный набор индикаторов). Итог аудита: valid=0 на обоих пулах, доказанного преимущества выше безубыточности нет ни у одного паттерна. Изменения в поведении: harmonic-pattern (crypto и forex) больше не valid — горизонт из таблицы не берётся, fallback-экспирация; подавляются (rejected) crypto fvg-return, fvg-nested, order-block-breaker, fvg-breaker-block, consolidation-breakout и forex consolidation-breakout; подавление crypto strong-order-block-reaction снято (по независимым наблюдениям p=0.274). Пороги детекторов, веса и фильтры не менялись.',
    filesChanged: ['src/decision/pattern-horizon-table.ts'],
    frozenAtMs: Date.UTC(2026, 8, 21),
  },
];

/**
 * Момент заморозки ДЕЙСТВУЮЩЕГО набора правил в целом — максимум по всем
 * записям. Намеренно не считается "по каждой правке отдельно": итоговая
 * система оценивается как единое целое (правки взаимодействуют друг с
 * другом — например, spread-balance-parity меняет, какие сделки вообще
 * попадают в 'win'/'loss', что напрямую влияет на выборку, от которой
 * wilson-min-samples считает свою границу). Самая свежая правка сбрасывает
 * часы для всех: до неё накопленный форвард-тест валиден для СТАРОЙ
 * комбинации правил, не для новой.
 */
export function currentFreezeMs(log: LogicChangeRecord[] = LOGIC_CHANGE_LOG): number {
  if (log.length === 0) return 0;
  return Math.max(...log.map((r) => r.frozenAtMs));
}

/** entryTime у SimulatedTrade — в секундах (как candle.time), не в мс. */
export function isForwardTestTrade(entryTimeSec: number, freezeAtMs: number): boolean {
  return entryTimeSec * 1000 >= freezeAtMs;
}

export type ForwardTestVerdict =
  | 'insufficient-data'
  | 'below-breakeven'
  | 'above-breakeven-not-significant'
  | 'significantly-above-breakeven';

export interface ForwardTestReport {
  freezeAtMs: number;
  freezeAtIso: string;
  forwardTradeCount: number;
  decidedCount: number;
  metrics: BacktestMetrics;
  breakevenWinRate: number;
  /** null, пока decidedCount === 0 — Wilson-границу не от чего считать. */
  reliableWinRateLowerBound: number | null;
  hasEnoughSamples: boolean;
  verdict: ForwardTestVerdict;
}

/**
 * Честная оценка "подтверждена ли текущая логика форвард-тестом", а не
 * ретроспективным бэктестом. Использует ТЕ ЖЕ функции (wilsonLowerBound,
 * breakevenWinRateFromProfitPercent), что и калибровка в
 * pattern-reliability-calibration.ts — намеренно: то же самое разночтение
 * "сырой winRate против реальной точки безубыточности", которое чинил
 * фикс breakeven-payout-aware, актуально и здесь, и дублировать эту логику
 * было бы ровно той же ошибкой (см. 20-кратное расхождение
 * MIN_FACTOR_SAMPLES/MIN_SAMPLES, которое чинил wilson-min-samples).
 *
 * profitPercent передаётся и в computeMetrics() (влияет на averageR —
 * см. BUGFIX в metrics.ts, "R-модель не совпадала с реальной экономикой
 * демо-счёта") — один и тот же payout теперь единообразно определяет и
 * точку безубыточности для вердикта, и доходность в самих метриках,
 * вместо двух независимых допущений об экономике счёта.
 */
export function computeForwardTestReport(
  trades: SimulatedTrade[],
  freezeAtMs: number,
  profitPercent: number,
): ForwardTestReport {
  const forward = trades.filter((t) => isForwardTestTrade(t.entryTime, freezeAtMs));
  const metrics = computeMetrics(forward, profitPercent);
  const decidedCount = metrics.wins + metrics.losses;
  const breakevenWinRate = breakevenWinRateFromProfitPercent(profitPercent);
  const hasEnoughSamples = decidedCount >= MIN_THRESHOLD_BACKTEST_SAMPLES;
  const reliableWinRateLowerBound = decidedCount > 0 ? wilsonLowerBound(metrics.wins, decidedCount) : null;

  let verdict: ForwardTestVerdict;
  if (!hasEnoughSamples || reliableWinRateLowerBound === null) {
    verdict = 'insufficient-data';
  } else if (metrics.winRate < breakevenWinRate) {
    verdict = 'below-breakeven';
  } else if (reliableWinRateLowerBound < breakevenWinRate) {
    // Сырой winRate формально выше безубытка, но недостаточно уверенно —
    // нижняя граница интервала Уилсона всё ещё ниже точки безубыточности.
    verdict = 'above-breakeven-not-significant';
  } else {
    verdict = 'significantly-above-breakeven';
  }

  return {
    freezeAtMs,
    freezeAtIso: new Date(freezeAtMs).toISOString(),
    forwardTradeCount: forward.length,
    decidedCount,
    metrics,
    breakevenWinRate,
    reliableWinRateLowerBound,
    hasEnoughSamples,
    verdict,
  };
}
