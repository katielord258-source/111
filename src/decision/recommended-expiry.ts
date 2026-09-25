import type { Timeframe, PatternName, AssetClass } from '@/types/domain';
import { TIMEFRAME_SECONDS, isCrypto } from '@/data/symbols';
import { PATTERN_HORIZON_TABLE, type PatternHorizonRecord } from './pattern-horizon-table';

// Фаза B + ревизия слияния 2026-09-18.
//
// recommendedExpiry консультирует сгенерированную таблицу горизонтов
// (pattern-horizon-table.ts, генератор — backtest/generate-pattern-horizon-table.ts).
//
// ТРИ статуса, а не два (это правка, а не косметика):
//   'valid'        — паттерн значимо лучше случайного И прошёл Wilson-гейт
//                    → используем откалиброванный expiryBars;
//   'no-evidence'  — данных не хватает, или отличие от 50% не установлено,
//                    или отличие есть, но Wilson-гейт не пройден
//                    → работаем по fallback, сигнал НЕ подавляем;
//   'rejected'     — есть значимое отличие В ХУДШУЮ сторону (accuracy < 50%
//                    при p <= alpha) → signal-builder.ts подавляет сигнал.
//
// Прежняя версия приравнивала 'significant === false' («отличие не
// установлено») к 'rejected' и молча выключала стратегию — это подмена
// «нет доказательств» на «доказано обратное». Так, например, inside-bar
// с n=6166 и p=0.87 выключался целиком.
//
// Таблица СКОУПНУТА ПО КЛАССУ АКТИВА. До этого результат крипто-прогона
// перебивал форекс-прогон того же периода: harmonic-pattern давал 55.1% на
// BTCUSDT/ETHUSDT и 44.0% на EURUSD/USDJPY, а в рантайм уходили крипто-30
// баров на оба класса.
//
// BUGFIX (аудит 2026-09-06, п.7 «экспирация слишком жёсткая для чопа»):
// раньше экспирация зависела только от volatilityPct (ATR/цена) и никогда —
// от regime/ADX. В range-режиме со слабым/угасающим трендом 3 бара почти
// не оставляют права на ошибку. Для сигналов, прошедших regime-гейт только
// с мягким штрафом (ADX в [20,30)), экспирация увеличивается на один бар.
// ВНИМАНИЕ: при попадании в 'valid' табличное значение имеет приоритет и
// эта чоп-поправка НЕ применяется — горизонт в этом случае измерен, а не
// выведен из волатильности (осознанное решение, см.
// docs/decisions/DECISION_PER_PATTERN_EXPIRY_UX.md).

export function assetClassOf(symbolId: string): AssetClass {
  return isCrypto(symbolId) ? 'crypto' : 'forex';
}

/**
 * Ключ таблицы горизонтов: для null/undefined setupType — плоский
 * `patternName`; для non-null — `patternName#setupType`.
 * Согласован с генератором (generate-pattern-horizon-table.ts::patternHorizonKey).
 */
export function patternHorizonKey(
  pattern: PatternName | null,
  setupType?: string | null,
): string | null {
  if (!pattern) return null;
  return setupType ? `${pattern}#${setupType}` : pattern;
}

export function lookupPatternHorizon(
  pattern: PatternName | null,
  assetClass: AssetClass,
  setupType?: string | null,
): PatternHorizonRecord | null {
  const key = patternHorizonKey(pattern, setupType);
  if (!key) return null;
  return PATTERN_HORIZON_TABLE[assetClass]?.[key] ?? null;
}

export function recommendedExpiry(
  pattern: PatternName | null,
  assetClass: AssetClass,
  timeframe: Timeframe,
  atr: number,
  entryPrice: number,
  isRangeWithWeakTrend: boolean = false,
  setupType?: string | null,
): number {
  const record = lookupPatternHorizon(pattern, assetClass, setupType);
  if (record && record.status === 'valid' && record.entry) {
    return TIMEFRAME_SECONDS[timeframe] * record.entry.expiryBars;
  }
  return fallbackExpiry(timeframe, atr, entryPrice, isRangeWithWeakTrend);
}

export function fallbackExpiry(
  timeframe: Timeframe,
  atr: number,
  entryPrice: number,
  isRangeWithWeakTrend: boolean = false,
): number {
  if (atr <= 0 || entryPrice <= 0) return TIMEFRAME_SECONDS[timeframe];
  const volatilityPct = atr / entryPrice;
  const baseBars = volatilityPct < 0.005 ? 3 : volatilityPct < 0.01 ? 2 : 1;
  const bars = isRangeWithWeakTrend ? baseBars + 1 : baseBars;
  return Math.round(TIMEFRAME_SECONDS[timeframe] * bars);
}

/**
 * true ТОЛЬКО когда паттерн на этом классе активов показал значимое
 * отличие в худшую сторону. 'no-evidence' сигнал не подавляет.
 */
export function isPatternHorizonRejected(
  pattern: PatternName | null,
  assetClass: AssetClass,
  setupType?: string | null,
): boolean {
  return lookupPatternHorizon(pattern, assetClass, setupType)?.status === 'rejected';
}
