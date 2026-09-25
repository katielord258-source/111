import { describe, it, expect } from 'vitest';
import {
  classifyDeduped,
  holmStepDown,
  driftBaselineFromCounts,
  requiredWinRateFor,
  type DedupedVerdictInput,
} from './horizon-verdict';

function input(over: Partial<DedupedVerdictInput> = {}): DedupedVerdictInput {
  return {
    testAccuracyDeduped: 0.6,
    pValueDeduped: 0.001,
    significantDeduped: true,
    wilsonLowerBoundDeduped: 0.57,
    requiredWinRate: 0.5556,
    wilsonMargin: 0,
    alpha: 0.05,
    ...over,
  };
}

describe('classifyDeduped', () => {
  it('valid: значимо вверх (Holm) + Wilson LB выше безубыточности', () => {
    expect(classifyDeduped(input()).status).toBe('valid');
  });

  it('РЕГРЕССИЯ: значимо вверх, но Wilson LB не выше безубыточности — no-evidence, не valid', () => {
    // Ровно случай harmonic-pattern: ~53% при безубыточности 55.56%.
    const r = classifyDeduped(input({ testAccuracyDeduped: 0.54, wilsonLowerBoundDeduped: 0.52 }));
    expect(r.status).toBe('no-evidence');
    expect(r.note).toMatch(/breakeven/);
  });

  it('граница безубыточности строгая: LB ровно на безубытке — не valid', () => {
    expect(classifyDeduped(input({ wilsonLowerBoundDeduped: 0.5556 })).status).toBe('no-evidence');
  });

  it('без requiredWinRate планка — только 0.5 + wilsonMargin', () => {
    expect(classifyDeduped(input({ requiredWinRate: null, wilsonLowerBoundDeduped: 0.51 })).status).toBe('valid');
    expect(classifyDeduped(input({ requiredWinRate: null, wilsonLowerBoundDeduped: 0.51, wilsonMargin: 0.02 })).status).toBe(
      'no-evidence',
    );
  });

  it('rejected: значимо ХУЖЕ 50% на независимых наблюдениях (сырая alpha)', () => {
    const r = classifyDeduped(
      input({ testAccuracyDeduped: 0.45, pValueDeduped: 0.0004, significantDeduped: false, wilsonLowerBoundDeduped: 0.44 }),
    );
    expect(r.status).toBe('rejected');
  });

  it('РЕГРЕССИЯ: significantDeduped=true при accuracy<50% не даёт допуска', () => {
    const r = classifyDeduped(input({ testAccuracyDeduped: 0.46, pValueDeduped: 0.2, significantDeduped: true }));
    expect(r.status).toBe('no-evidence');
  });

  it('не значимо (p выше alpha) — no-evidence, а не rejected', () => {
    const r = classifyDeduped(input({ testAccuracyDeduped: 0.47, pValueDeduped: 0.3, significantDeduped: false }));
    expect(r.status).toBe('no-evidence');
  });

  it('меньше порога независимых наблюдений (p=null) — no-evidence с пояснением', () => {
    const r = classifyDeduped(input({ testAccuracyDeduped: null, pValueDeduped: null, significantDeduped: null }));
    expect(r.status).toBe('no-evidence');
    expect(r.note).toMatch(/independent/);
  });

  it('NaN p-value трактуется как «нет теста», а не как значимость', () => {
    expect(classifyDeduped(input({ pValueDeduped: NaN })).status).toBe('no-evidence');
  });
});

describe('holmStepDown', () => {
  // Независимая эталонная реализация процедуры Холма.
  function reference(ps: (number | null)[], accs: (number | null)[], alpha: number): (boolean | null)[] {
    const order = ps
      .map((p, i) => ({ p, i }))
      .filter((x): x is { p: number; i: number } => x.p !== null)
      .sort((a, b) => a.p - b.p);
    const m = order.length;
    const out: (boolean | null)[] = ps.map(() => null);
    let rejecting = true;
    order.forEach((x, rank) => {
      if (rejecting && x.p <= alpha / (m - rank)) {
        out[x.i] = accs[x.i] !== null && (accs[x.i] as number) > 0.5;
      } else {
        rejecting = false;
        out[x.i] = false;
      }
    });
    return out;
  }

  it('совпадает с эталонной реализацией на наборе случайных семейств', () => {
    let seed = 12345;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    for (let t = 0; t < 200; t++) {
      const n = 1 + Math.floor(rnd() * 12);
      const ps = Array.from({ length: n }, () => (rnd() < 0.15 ? null : rnd() * rnd() * 0.1));
      const accs = ps.map(() => (rnd() < 0.1 ? null : 0.4 + rnd() * 0.2));
      const got = holmStepDown(ps.map((p, i) => ({ pValue: p, accuracy: accs[i] })), 0.05);
      expect(got).toEqual(reference(ps, accs, 0.05));
    }
  });

  it('step-down: после первого непрошедшего гипотезы дальше не отвергаются', () => {
    // m=3, alpha=.05: пороги .0167, .025, .05. p=.03 не проходит .0167 → p=.04 тоже не отвергается.
    const got = holmStepDown(
      [
        { pValue: 0.03, accuracy: 0.6 },
        { pValue: 0.04, accuracy: 0.6 },
        { pValue: 0.045, accuracy: 0.6 },
      ],
      0.05,
    );
    expect(got).toEqual([false, false, false]);
  });

  it('РЕГРЕССИЯ (2026-09-18): отвергнутая H0 при accuracy < baseline — не значимость вверх', () => {
    const got = holmStepDown([{ pValue: 0.0061, accuracy: 0.463 }], 0.05);
    expect(got).toEqual([false]);
  });

  it('null / NaN p-value в семейство не входят и остаются null', () => {
    const got = holmStepDown(
      [
        { pValue: null, accuracy: 0.6 },
        { pValue: NaN, accuracy: 0.6 },
        { pValue: 0.001, accuracy: 0.6 },
      ],
      0.05,
    );
    expect(got).toEqual([null, null, true]);
  });
});

describe('driftBaselineFromCounts / requiredWinRateFor', () => {
  it('одни buy при 60% ростов: случайный buy выигрывает 60% — дрейф съедает «эдж»', () => {
    expect(driftBaselineFromCounts(1000, 600, 1000)).toBeCloseTo(0.6, 10);
  });

  it('сбалансированный микс при нейтральном рынке — 50%', () => {
    expect(driftBaselineFromCounts(1000, 500, 500)).toBeCloseTo(0.5, 10);
  });

  it('смешанный микс: 70% buy, 55% ростов → 0.7*0.55 + 0.3*0.45', () => {
    expect(driftBaselineFromCounts(1000, 550, 700)).toBeCloseTo(0.7 * 0.55 + 0.3 * 0.45, 10);
  });

  it('нет решённых исходов — null', () => {
    expect(driftBaselineFromCounts(0, 0, 0)).toBeNull();
  });

  it('requiredWinRate — максимум из безубыточности и дрейфа', () => {
    expect(requiredWinRateFor(0.5556, 0.52)).toBe(0.5556);
    expect(requiredWinRateFor(0.5, 0.53)).toBe(0.53);
    expect(requiredWinRateFor(0.5556, null)).toBe(0.5556);
  });
});
