import { describe, it, expect } from 'vitest';
import { isValidCandle, filterValidCandles } from './candle-validation';
import type { Candle } from '@/types/domain';

function c(overrides: Partial<Candle> = {}): Candle {
  return { time: 1000, open: 1.14, high: 1.15, low: 1.13, close: 1.145, volume: 0, ...overrides };
}

describe('isValidCandle', () => {
  it('accepts a normal valid candle', () => {
    expect(isValidCandle(c())).toBe(true);
  });

  it('accepts a flat candle (open === high === low === close)', () => {
    expect(isValidCandle(c({ open: 1.14, high: 1.14, low: 1.14, close: 1.14 }))).toBe(true);
  });

  it('accepts zero volume (Deriv forex)', () => {
    expect(isValidCandle(c({ volume: 0 }))).toBe(true);
  });

  it('rejects zero OHLC values', () => {
    expect(isValidCandle(c({ open: 0 }))).toBe(false);
    expect(isValidCandle(c({ high: 0 }))).toBe(false);
    expect(isValidCandle(c({ low: 0 }))).toBe(false);
    expect(isValidCandle(c({ close: 0 }))).toBe(false);
  });

  it('rejects NaN OHLC values', () => {
    expect(isValidCandle(c({ open: NaN }))).toBe(false);
    expect(isValidCandle(c({ high: NaN }))).toBe(false);
    expect(isValidCandle(c({ low: NaN }))).toBe(false);
    expect(isValidCandle(c({ close: NaN }))).toBe(false);
  });

  it('rejects malformed high/low relationship', () => {
    expect(isValidCandle(c({ high: 1.12, low: 1.13 }))).toBe(false);
    expect(isValidCandle(c({ high: 1.13, open: 1.14 }))).toBe(false);
    expect(isValidCandle(c({ low: 1.15, close: 1.14 }))).toBe(false);
  });

  it('rejects non-positive timestamp', () => {
    expect(isValidCandle(c({ time: 0 }))).toBe(false);
    expect(isValidCandle(c({ time: -1 }))).toBe(false);
    expect(isValidCandle(c({ time: NaN }))).toBe(false);
  });
});

describe('filterValidCandles', () => {
  it('filters out invalid candles and keeps valid ones', () => {
    const candles: Candle[] = [
      c({ time: 1 }),
      c({ time: 2, open: 0 }),
      c({ time: 3, high: NaN }),
      c({ time: 4 }),
      c({ time: 5, low: 0 }),
    ];
    const result = filterValidCandles(candles);
    expect(result).toHaveLength(2);
    expect(result.map((x) => x.time)).toEqual([1, 4]);
  });

  it('returns empty array for all-invalid input', () => {
    const candles: Candle[] = [
      c({ time: 1, open: 0 }),
      c({ time: 2, close: NaN }),
    ];
    expect(filterValidCandles(candles)).toEqual([]);
  });
});
