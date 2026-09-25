import { describe, it, expect } from 'vitest';
import { generateRandomWalk } from './synthetic/random-walk';
import { computeMicrostructureStats, interpretLag1 } from './microstructure';
import { runNullAudit } from './null-audit';

describe('generateRandomWalk', () => {
  it('детерминирован по seed и различается между seed', () => {
    const a = generateRandomWalk({ bars: 500, seed: 1 });
    const b = generateRandomWalk({ bars: 500, seed: 1 });
    const c = generateRandomWalk({ bars: 500, seed: 2 });
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it('OHLC-инварианты, шаг времени и нулевой объём (как в реальных Deriv-данных)', () => {
    const candles = generateRandomWalk({ bars: 2000, seed: 3, noiseFraction: 0.25 });
    expect(candles).toHaveLength(2000);
    for (let i = 0; i < candles.length; i++) {
      const c = candles[i];
      expect(c.high).toBeGreaterThanOrEqual(Math.max(c.open, c.close) - 1e-12);
      expect(c.low).toBeLessThanOrEqual(Math.min(c.open, c.close) + 1e-12);
      expect(c.volume).toBe(0);
      if (i > 0) expect(c.time - candles[i - 1].time).toBe(60);
    }
  });

  it('котировки квантованы по tick — на минутных доходностях появляются «ничьи»', () => {
    const st = computeMicrostructureStats(generateRandomWalk({ bars: 20000, seed: 4 }));
    expect(st.tieRate).toBeGreaterThan(0);
    expect(st.tieRate).toBeLessThan(0.2);
  });
});

describe('computeMicrostructureStats', () => {
  it('чистое блуждание: автокорреляция ≈ 0, VR(2) ≈ 1, вывод — «нет»', () => {
    const st = computeMicrostructureStats(generateRandomWalk({ bars: 60000, seed: 5, volatilityClustering: false }));
    expect(Math.abs(st.autocorr[0])).toBeLessThan(4 * st.autocorrStdErr);
    expect(st.varianceRatio2!).toBeGreaterThan(0.95);
    expect(st.varianceRatio2!).toBeLessThan(1.05);
    expect(interpretLag1(st)).toBe('none');
  });

  it('шум наблюдения даёт отрицательную ρ₁ (≈ −0.05 при 0.25σ) и VR(2) < 1', () => {
    const st = computeMicrostructureStats(
      generateRandomWalk({ bars: 60000, seed: 6, noiseFraction: 0.25, volatilityClustering: false }),
    );
    expect(st.autocorr[0]).toBeLessThan(-0.03);
    expect(st.autocorr[0]).toBeGreaterThan(-0.09);
    expect(st.varianceRatio2!).toBeLessThan(0.98);
    expect(interpretLag1(st)).toBe('mean-reverting');
  });

  it('искусственный тренд (инерция) распознаётся как trending', () => {
    // r_t = 0.3*r_{t-1} + e_t
    let seed = 9;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296 - 0.5;
    };
    const candles = [];
    let price = 100;
    let prevR = 0;
    for (let i = 0; i < 30000; i++) {
      const r = 0.3 * prevR + rnd() * 0.002;
      prevR = r;
      const o = price;
      price *= Math.exp(r);
      candles.push({ time: i * 60, open: o, high: Math.max(o, price), low: Math.min(o, price), close: price, volume: 0 });
    }
    const st = computeMicrostructureStats(candles);
    expect(st.autocorr[0]).toBeGreaterThan(0.2);
    expect(interpretLag1(st)).toBe('trending');
  });

  it('мало данных / константа — нулевая статистика без исключений', () => {
    expect(computeMicrostructureStats([]).varianceRatio2).toBeNull();
    const flat = Array.from({ length: 100 }, (_, i) => ({ time: i * 60, open: 1, high: 1, low: 1, close: 1, volume: 0 }));
    const st = computeMicrostructureStats(flat);
    expect(st.tieRate).toBe(1);
    expect(st.autocorr.every((x) => x === 0)).toBe(true);
    expect(interpretLag1(st)).toBe('none');
  });
});

describe('runNullAudit (конвейер аудита на данных без предсказуемости)', () => {
  it('ни один паттерн не получает вердикт valid; строки согласованы', { timeout: 60000 }, () => {
    const res = runNullAudit({
      bars: 6000,
      seed: 1,
      noiseFraction: 0.25,
      payoutPercent: 80,
      folds: 8,
      purgeBars: 30,
      windowSize: 500,
      dedupeScope: 'pool',
      indicators: 'live',
    });
    expect(res.validCount).toBe(0);
    for (const row of res.rows) {
      expect(row.verdict).not.toBe('valid');
      // независимых исходов никогда не больше сырых
      if (row.rawDecided !== null) expect(row.independentTestDecided).toBeLessThanOrEqual(row.rawDecided);
    }
  });
});
