import type { Candle } from '@/types/domain';

/**
 * Проверка валидности свечи: все OHLC конечны и больше нуля, high/low
 * согласованы с open/close, timestamp положительный. Volume не проверяется
 * (ноль — нормальное значение для Deriv forex). Плоская свеча
 * (open === high === low === close) — валидна.
 */
export function isValidCandle(c: Candle): boolean {
  if (!c) return false;
  const { time, open, high, low, close } = c;
  if (!Number.isFinite(time) || time <= 0) return false;
  if (!Number.isFinite(open) || open <= 0) return false;
  if (!Number.isFinite(high) || high <= 0) return false;
  if (!Number.isFinite(low) || low <= 0) return false;
  if (!Number.isFinite(close) || close <= 0) return false;
  if (high < low) return false;
  if (high < open || high < close) return false;
  if (low > open || low > close) return false;
  return true;
}

/** Фильтрует массив свечей, оставляя только валидные. */
export function filterValidCandles(candles: Candle[]): Candle[] {
  return candles.filter(isValidCandle);
}
