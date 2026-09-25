import { describe, it, expect } from 'vitest';
import type { Candle } from '@/types/domain';
import { computeContinuationStats, interpretTopBuckets, DEFAULT_CONTINUATION_CONFIG } from './continuation';

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gauss(r: () => number): number {
  let u = 0, v = 0;
  while (u === 0) u = r();
  while (v === 0) v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
/** Свечи из последовательности логдоходностей; фитили — небольшие, детерминированные. */
function candlesFrom(returns: number[], start = 100): Candle[] {
  const out: Candle[] = [];
  let p = start;
  for (let i = 0; i < returns.length; i++) {
    const open = p;
    const close = p * Math.exp(returns[i]);
    const wick = Math.abs(returns[i]) * 0.3 + 1e-5;
    out.push({ time: 1_700_000_000 + i * 60, open, close, high: Math.max(open, close) * (1 + wick), low: Math.min(open, close) * (1 - wick), volume: 0 });
    p = close;
  }
  return out;
}
function series(n: number, phi: number, seed: number): number[] {
  const r = rng(seed);
  const x: number[] = [];
  let prev = 0;
  for (let i = 0; i < n; i++) {
    const v = phi * prev + 0.0005 * gauss(r);
    x.push(v);
    prev = v;
  }
  return x;
}
const topAll = (res: ReturnType<typeof computeContinuationStats>, h: number) => {
  const cells = res.cells.filter((c) => c.direction === 'all' && c.horizon === h);
  return cells[cells.length - 1];
};

describe('computeContinuationStats', () => {
  it('случайное блуждание: разворота/продолжения нет, контроль случайного знака ≈ 50%', () => {
    const res = computeContinuationStats(candlesFrom(series(60000, 0, 11)));
    for (const h of [1, 3]) {
      const c = topAll(res, h);
      // верхняя корзина (99–100%) — ~600 наблюдений: σ ≈ 0.02, допуск 3.5σ
      expect(Math.abs(c.excess as number)).toBeLessThan(0.07);
      expect(Math.abs((c.controlAccuracy as number) - 0.5)).toBeLessThan(0.07);
      // корзина 50–80% — тысячи наблюдений: допуск жёстче
      const mid = res.cells.find((x) => x.direction === 'all' && x.horizon === h && x.bucket === '50–80%')!;
      expect(Math.abs(mid.excess as number)).toBeLessThan(0.02);
      expect(Math.abs((mid.controlAccuracy as number) - 0.5)).toBeLessThan(0.02);
    }
    expect(interpretTopBuckets(res)).toBe('none');
  });

  it('отрицательная автокорреляция (φ=-0.3): после крупной свечи разворот, значимо', () => {
    const res = computeContinuationStats(candlesFrom(series(60000, -0.3, 12)));
    const c = topAll(res, 1);
    expect(c.excess as number).toBeLessThan(-0.05);
    expect(c.pValue as number).toBeLessThan(0.01);
    expect(interpretTopBuckets(res)).toBe('reversal');
  });

  it('положительная автокорреляция (φ=+0.3): продолжение', () => {
    const res = computeContinuationStats(candlesFrom(series(60000, 0.3, 13)));
    const c = topAll(res, 1);
    expect(c.excess as number).toBeGreaterThan(0.05);
    expect(interpretTopBuckets(res)).toBe('continuation');
  });

  it('ничьи (close[i+h]==close[i]) исключаются, доджи пропускаются и считаются отдельно', () => {
    const rets = series(5000, 0, 14);
    for (let i = 200; i < 260; i++) rets[i] = 0; // серия доджи
    const res = computeContinuationStats(candlesFrom(rets));
    expect(res.dojiSkipped).toBeGreaterThan(0);
    const total = res.cells.filter((c) => c.direction === 'all' && c.horizon === 1).reduce((s, c) => s + c.n + c.ties, 0);
    expect(total).toBe(res.candidates);
  });

  it('ожидаемая точность при независимости не смещается дрейфом: сильный тренд без автокорреляции даёт excess≈0', () => {
    const base = series(60000, 0, 15).map((x) => x + 0.0003); // дрейф
    const res = computeContinuationStats(candlesFrom(base));
    const c = topAll(res, 3);
    expect(Math.abs(c.excess as number)).toBeLessThan(0.03);
  });

  it('срезы «только вверх/вниз» не вырождаются: при разворотном режиме excess отрицателен и в них тоже', () => {
    const res = computeContinuationStats(candlesFrom(series(60000, -0.3, 17)));
    for (const dir of ['buy', 'sell'] as const) {
      const cells = res.cells.filter((c) => c.direction === dir && c.horizon === 1);
      const c = cells[cells.length - 1];
      expect(c.excess as number).toBeLessThan(-0.05);
      expect(c.excess as number).not.toBe(0);
    }
  });

  it('режим next-open: разворот, целиком происходящий ДО открытия следующего бара, исчезает', () => {
    // Свеча с большим телом, затем следующий бар ОТКРЫВАЕТСЯ уже после отката (гэп), а дальше — случайное блуждание.
    const rets = series(60000, 0, 21);
    const cs = candlesFrom(rets);
    for (let i = 300; i + 2 < cs.length; i += 7) {
      const body = cs[i].close - cs[i].open;
      if (Math.abs(body) / cs[i].close < 0.0012) continue;
      cs[i + 1] = { ...cs[i + 1], open: cs[i].close - body * 0.9 };
    }
    const closeMode = computeContinuationStats(cs, { ...DEFAULT_CONTINUATION_CONFIG, entry: 'close' });
    const nextMode = computeContinuationStats(cs, { ...DEFAULT_CONTINUATION_CONFIG, entry: 'next-open' });
    const c1 = topAll(closeMode, 1);
    const c2 = topAll(nextMode, 1);
    // при входе по close откат до open[i+1] виден как разворот; при входе по next-open — нет
    expect(c2.excess as number).toBeGreaterThan(c1.excess as number);
  });

  it('детерминирован при одном seed', () => {
    const cs = candlesFrom(series(8000, 0, 16));
    const a = computeContinuationStats(cs, { ...DEFAULT_CONTINUATION_CONFIG, seed: 3 });
    const b = computeContinuationStats(cs, { ...DEFAULT_CONTINUATION_CONFIG, seed: 3 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
