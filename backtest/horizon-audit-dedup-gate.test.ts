import { describe, it, expect } from 'vitest';
import {
  applyDedupedVerdicts,
  computeDedupedStatsHoldout,
  computeDedupedStatsWalkForward,
  computeWalkForwardResult,
  dedupeOccurrences,
  dedupeOccurrencesPooled,
  generateMarkdown,
  tallyDrift,
  type CliArgs,
  type DedupedContext,
  type Occurrence,
  type PatternResult_,
  type PoolMeta,
} from './horizon-audit';
import { computeFoldBoundaries, assignFoldIndex } from './horizon-partitioning';
import { binomialSignificanceTest } from './significance';
import type { SignalDirection } from '@/types/domain';

const GRID = [10, 20, 30];
const MAX_GAP = 30;

function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function occ(
  symbolId: string,
  direction: SignalDirection,
  bar: number,
  win: boolean,
  partition: Occurrence['partition'] = 'train',
): Occurrence {
  const outcomes = new Map<number, number>();
  for (const e of GRID) outcomes.set(e, win ? 1 : -1);
  return {
    patternName: 'harmonic-pattern',
    setupType: null,
    direction,
    symbolId,
    barIndex: bar,
    time: bar * 60,
    entryPrice: 1,
    confidence: 0.6,
    partition,
    fold: 0,
    outcomes,
  };
}

/**
 * Кластерная модель «один сетап = perCluster подряд идущих срабатываний с
 * ОДНИМ И ТЕМ ЖЕ исходом» (именно так перекрываются срабатывания
 * harmonic-pattern). Направление сигнала случайно 50/50, поэтому дрейф
 * рынка нейтрален, а «эдж» — только winProb.
 */
function makeClusters(clusters: number, perCluster: number, winProb: number, seed: number): Occurrence[] {
  const r = mulberry32(seed);
  const out: Occurrence[] = [];
  for (let c = 0; c < clusters; c++) {
    const win = r() < winProb;
    const dir: SignalDirection = r() < 0.5 ? 'buy' : 'sell';
    for (let k = 0; k < perCluster; k++) out.push(occ('SYNTH', dir, c * 200 + k, win));
  }
  return out;
}

function withFolds(occs: Occurrence[], folds = 5) {
  let minT = Infinity;
  let maxT = -Infinity;
  for (const o of occs) {
    minT = Math.min(minT, o.time);
    maxT = Math.max(maxT, o.time);
  }
  const boundaries = computeFoldBoundaries(minT, maxT, folds);
  assignFoldIndex(occs, boundaries);
  return boundaries;
}

function ctx(over: Partial<DedupedContext> = {}): DedupedContext {
  return {
    alpha: 0.05,
    minTrainSamples: 30,
    wilsonMargin: 0,
    breakevenRate: 0.5556,
    dedupeScope: 'symbol',
    barSeconds: 60,
    ...over,
  };
}

function verdictFor(stats: ReturnType<typeof computeDedupedStatsWalkForward>) {
  const r = { status: 'ok', ...stats } as unknown as PatternResult_;
  applyDedupedVerdicts([r], { alpha: 0.05, wilsonMargin: 0 });
  return r;
}

describe('dedupeOccurrencesPooled', () => {
  it('одновременный сетап на 4 инструментах — ОДНО событие', () => {
    const occs = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT'].map((s) => occ(s, 'buy', 500, true));
    expect(dedupeOccurrencesPooled(occs, MAX_GAP, 60)).toHaveLength(1);
    // Прежняя (внутри-инструментная) дедупликация считала бы их четырьмя независимыми.
    expect(dedupeOccurrences(occs, MAX_GAP)).toHaveLength(4);
  });

  it('сдвиг между инструментами в пределах горизонта всё равно один кластер', () => {
    const occs = [occ('BTCUSDT', 'buy', 100, true), occ('ETHUSDT', 'buy', 115, true), occ('SOLUSDT', 'buy', 130, true)];
    expect(dedupeOccurrencesPooled(occs, MAX_GAP, 60).map((o) => o.symbolId)).toEqual(['BTCUSDT']);
  });

  it('следующее событие строго позже горизонта сохраняется (gap > minGap, как в dedupeOccurrences)', () => {
    const occs = [occ('A', 'buy', 100, true), occ('B', 'buy', 130, true), occ('A', 'buy', 131, true)];
    expect(dedupeOccurrencesPooled(occs, MAX_GAP, 60).map((o) => o.barIndex)).toEqual([100, 131]);
  });

  it('buy и sell — независимые потоки', () => {
    const occs = [occ('A', 'buy', 100, true), occ('B', 'sell', 100, true), occ('A', 'sell', 101, true)];
    expect(dedupeOccurrencesPooled(occs, MAX_GAP, 60)).toHaveLength(2);
  });

  it('детерминизм: результат не зависит от порядка входа; вход не мутируется', () => {
    const a = [occ('B', 'buy', 100, true), occ('A', 'buy', 100, false), occ('C', 'buy', 400, true)];
    const b = [...a].reverse();
    const ra = dedupeOccurrencesPooled(a, MAX_GAP, 60).map((o) => `${o.symbolId}@${o.barIndex}`);
    const rb = dedupeOccurrencesPooled(b, MAX_GAP, 60).map((o) => `${o.symbolId}@${o.barIndex}`);
    expect(ra).toEqual(rb);
    expect(ra).toEqual(['A@100', 'C@400']); // при совпадении времени — по алфавиту symbolId
    expect(a.map((o) => o.symbolId)).toEqual(['B', 'A', 'C']);
  });

  it('масштабируется по длине бара: на 5m горизонт в 30 баров = 9000 с', () => {
    const o1 = { ...occ('A', 'buy', 0, true), time: 0 };
    const o2 = { ...occ('B', 'buy', 0, true), time: 8000 };
    const o3 = { ...occ('C', 'buy', 0, true), time: 9001 };
    expect(dedupeOccurrencesPooled([o1, o2, o3], 30, 300).map((o) => o.symbolId)).toEqual(['A', 'C']);
  });
});

describe('tallyDrift', () => {
  it('считает решённые, ростовые и buy; ничьи (0) пропускает; исход хранится относительно направления', () => {
    const mk = (dir: SignalDirection, out: number): Occurrence => {
      const o = occ('S', dir, 1, true);
      o.outcomes.set(10, out);
      return o;
    };
    // buy+1 (рост), buy-1 (падение), sell+1 (падение), sell-1 (рост), buy 0 (ничья)
    const t = tallyDrift([mk('buy', 1), mk('buy', -1), mk('sell', 1), mk('sell', -1), mk('buy', 0)], 10);
    expect(t).toEqual({ decided: 4, rises: 2, buys: 2 });
  });

  it('expiry без исхода (undefined) не считается решённым', () => {
    expect(tallyDrift([occ('S', 'buy', 1, true)], 999)).toEqual({ decided: 0, rises: 0, buys: 0 });
  });
});

describe('дедуплицированный вердикт (walk-forward)', () => {
  // Параметры подобраны так, чтобы сценарии были СОДЕРЖАТЕЛЬНО разными;
  // seed фиксирован, поэтому результат детерминирован.
  const SEED = 3;

  it('РЕГРЕССИЯ (суть отчёта A′.5): сырой тест «значим», на независимых наблюдениях — нет', () => {
    const occs = makeClusters(400, 30, 0.52, SEED);
    const b = withFolds(occs);

    const raw = computeWalkForwardResult(occs, GRID, b, 0, 30);
    const rawP = binomialSignificanceTest(raw.aggregatedWins, raw.aggregatedDecided, 0.5, 0.05).pValue;
    expect(rawP).toBeLessThan(0.05); // перекрытие раздувает n ≈ в 30 раз

    const stats = computeDedupedStatsWalkForward(occs, GRID, b, 0, ctx());
    expect(stats.independentTestDecided).toBeLessThan(raw.aggregatedDecided / 20);
    expect(stats.pValueDeduped).not.toBeNull();
    expect(stats.pValueDeduped!).toBeGreaterThan(0.05);
    expect(verdictFor(stats).verdict).toBe('no-evidence');
  });

  it('сильный реальный эдж проходит и при безубыточности 55.56%, и при 50%', () => {
    const occs = makeClusters(600, 30, 0.64, SEED);
    const b = withFolds(occs);
    for (const be of [0.5556, 0.5]) {
      const r = verdictFor(computeDedupedStatsWalkForward(occs, GRID, b, 0, ctx({ breakevenRate: be })));
      expect(r.verdict).toBe('valid');
      expect(r.significantDeduped).toBe(true);
      expect(r.passesBreakevenGate).toBe(true);
    }
  });

  it('слабый значимый эдж: valid при payout 100% (безубыток 50%), но НЕ valid при payout 80% (55.56%)', () => {
    const occs = makeClusters(900, 30, 0.56, SEED);
    const b = withFolds(occs);

    const at80 = verdictFor(computeDedupedStatsWalkForward(occs, GRID, b, 0, ctx({ breakevenRate: 100 / 180 })));
    expect(at80.significantDeduped).toBe(true);
    expect(at80.wilsonLowerBoundDeduped!).toBeLessThan(100 / 180);
    expect(at80.verdict).toBe('no-evidence');
    expect(at80.verdictNote).toMatch(/breakeven/);

    const at100 = verdictFor(computeDedupedStatsWalkForward(occs, GRID, b, 0, ctx({ breakevenRate: 0.5 })));
    expect(at100.verdict).toBe('valid');
  });

  it('меньше 200 независимых решённых исходов: p-value не считается, вердикт no-evidence', () => {
    const occs = makeClusters(150, 30, 0.7, SEED);
    const b = withFolds(occs);
    const stats = computeDedupedStatsWalkForward(occs, GRID, b, 0, ctx());
    expect(stats.independentTestDecided).toBeLessThan(200);
    expect(stats.pValueDeduped).toBeNull();
    expect(stats.wilsonLowerBoundDeduped).toBeNull();
    expect(verdictFor(stats).verdict).toBe('no-evidence');
  });

  it('дрейф-baseline: односторонние buy-сигналы на растущем рынке не считаются эджем', () => {
    // Все сигналы buy, «выигрыш» = цена выросла в 62% случаев. Это дрейф, не эдж.
    const r = mulberry32(11);
    const occs: Occurrence[] = [];
    for (let c = 0; c < 700; c++) {
      const win = r() < 0.62;
      for (let k = 0; k < 30; k++) occs.push(occ('SYNTH', 'buy', c * 200 + k, win));
    }
    const b = withFolds(occs);
    const stats = computeDedupedStatsWalkForward(occs, GRID, b, 0, ctx({ breakevenRate: 0.5 }));
    expect(stats.driftBaseline!).toBeCloseTo(stats.testAccuracyDeduped!, 10);
    expect(stats.passesBreakevenGate).toBe(false);
    expect(verdictFor(stats).verdict).not.toBe('valid');
  });

  it('пул: та же серия на 4 инструментах в одно время не создаёт независимости', () => {
    const one = makeClusters(300, 30, 0.6, SEED);
    const four: Occurrence[] = [];
    for (const sym of ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT']) {
      for (const o of one) four.push({ ...o, symbolId: sym, outcomes: new Map(o.outcomes) });
    }
    const bOne = withFolds(one);
    const bFour = withFolds(four);
    const pooled = computeDedupedStatsWalkForward(four, GRID, bFour, 0, ctx({ dedupeScope: 'pool' }));
    const single = computeDedupedStatsWalkForward(one, GRID, bOne, 0, ctx({ dedupeScope: 'pool' }));
    const perSymbol = computeDedupedStatsWalkForward(four, GRID, bFour, 0, ctx({ dedupeScope: 'symbol' }));

    expect(pooled.independentTestDecided).toBe(single.independentTestDecided);
    expect(perSymbol.independentTestDecided).toBe(4 * single.independentTestDecided);
  });
});

describe('дедуплицированный вердикт (holdout)', () => {
  it('считает по дедуплицированным train/test и возвращает счётчики', () => {
    const r = mulberry32(5);
    const occs: Occurrence[] = [];
    for (let c = 0; c < 500; c++) {
      const win = r() < 0.65;
      const dir: SignalDirection = r() < 0.5 ? 'buy' : 'sell';
      const part: Occurrence['partition'] = c < 300 ? 'train' : c < 400 ? 'validation' : 'test';
      for (let k = 0; k < 30; k++) occs.push(occ('SYNTH', dir, c * 200 + k, win, part));
    }
    const stats = computeDedupedStatsHoldout(occs, GRID, ctx());
    expect(stats.independentCount).toBe(500);
    expect(stats.independentTestDecided).toBe(100);
    expect(stats.pValueDeduped).toBeNull(); // 100 < 200 независимых test-исходов
  });

  it('нет train-данных — пустая статистика без исключений', () => {
    const occs = [occ('S', 'buy', 1, true, 'test')];
    const stats = computeDedupedStatsHoldout(occs, GRID, ctx());
    expect(stats.pValueDeduped).toBeNull();
    expect(stats.independentCount).toBe(1);
  });
});

describe('applyDedupedVerdicts', () => {
  function res(over: Partial<PatternResult_>): PatternResult_ {
    return { status: 'ok', ...over } as PatternResult_;
  }

  it('Holm по дедуплицированному семейству: два «сырых» p=.03/.04 при m=2 не проходят', () => {
    const a = res({ testAccuracyDeduped: 0.6, pValueDeduped: 0.03, wilsonLowerBoundDeduped: 0.56, requiredWinRate: 0.5 });
    const b = res({ testAccuracyDeduped: 0.6, pValueDeduped: 0.04, wilsonLowerBoundDeduped: 0.56, requiredWinRate: 0.5 });
    applyDedupedVerdicts([a, b], { alpha: 0.05, wilsonMargin: 0 });
    expect(a.significantDeduped).toBe(false);
    expect(b.significantDeduped).toBe(false);
    expect(a.verdict).toBe('no-evidence');
  });

  it('status !== ok: вердикта нет (null), в семейство не входит', () => {
    const ok = res({ testAccuracyDeduped: 0.7, pValueDeduped: 0.0001, wilsonLowerBoundDeduped: 0.66, requiredWinRate: 0.5556 });
    const skipped = res({ status: 'insufficient-data' });
    const none = res({ status: 'no-detections' });
    applyDedupedVerdicts([ok, skipped, none], { alpha: 0.05, wilsonMargin: 0 });
    expect(ok.verdict).toBe('valid');
    expect(skipped.verdict).toBeNull();
    expect(skipped.significantDeduped).toBeNull();
    expect(none.verdict).toBeNull();
  });

  it('ok-результат без дедуп-статистики → no-evidence (не valid по умолчанию)', () => {
    const r = res({});
    applyDedupedVerdicts([r], { alpha: 0.05, wilsonMargin: 0 });
    expect(r.verdict).toBe('no-evidence');
  });
});

describe('generateMarkdown (схема 2)', () => {
  const args: CliArgs = {
    symbols: ['BTCUSDT', 'ETHUSDT'],
    from: '2026-03-01',
    to: '2026-09-17',
    timeframe: '1m',
    outputDir: 'x',
    windowSize: 500,
    minSamples: 30,
    significanceAlpha: 0.05,
    split: 'walkforward',
    walkForwardFolds: 8,
    purgeBars: 30,
    wilsonMargin: 0,
    payoutPercent: 80,
    dedupeScope: 'pool',
    indicators: 'live',
    funnel: false,
  };
  const poolMeta: PoolMeta = {
    symbols: args.symbols,
    split: 'walkforward',
    walkForwardFolds: 8,
    purgeBars: 30,
    wilsonMargin: 0,
    payoutPercent: 80,
    breakevenRate: 100 / 180,
    dedupeScope: 'pool',
    indicators: 'live',
    indicatorCount: 18,
    correlationWarning: 'test',
    perSymbolCandleCounts: [{ symbolId: 'BTCUSDT', candles1m: 10, candlesResampled: 10 }],
  };

  function base(over: Partial<PatternResult_>): PatternResult_ {
    return {
      patternName: 'harmonic-pattern',
      setupType: null,
      totalOccurrences: 100,
      trainValCount: 50,
      testCount: 50,
      bestExpiryBars: 30,
      testAccuracy: 0.532,
      testWinCount: 26,
      testDecidedCount: 50,
      baselineMean: 0.5,
      baselineStd: null,
      pValue: 0.0,
      significant: true,
      wilsonLowerBound: 0.522,
      passesWilsonGate: true,
      status: 'ok',
      perSymbol: [],
      perExpiry: [],
      perFold: [],
      independentCount: 1148,
      independentTestDecided: 1000,
      testAccuracyDeduped: 0.52,
      pValueDeduped: 0.17,
      wilsonLowerBoundDeduped: 0.49,
      passesWilsonGateDeduped: false,
      requiredWinRate: 0.5556,
      passesBreakevenGate: false,
      significantDeduped: false,
      verdict: 'no-evidence',
      verdictNote: 'not distinguishable from baseline (deduplicated)',
      ...over,
    };
  }

  it('содержит payout, безубыточность, вердикт и сравнение сырой/дедуп. значимости', () => {
    const md = generateMarkdown(args, poolMeta, 10, 10, [base({}), base({ patternName: 'inside-bar', verdict: 'rejected', verdictNote: '' })], {
      from: args.from,
      to: args.to,
    });
    expect(md).toContain('Выплата (payout): 80%');
    expect(md).toContain('55.56%');
    expect(md).toContain('--dedupe-scope=pool');
    expect(md).toContain('Вердикт valid');
    expect(md).toContain('Значим (дедуп.)');
    // harmonic: сырой значим, но вердикт — no-evidence
    expect(md).toMatch(/\| harmonic-pattern \|[^\n]*no-evidence/);
    // Число колонок заголовка и разделителя совпадает
    const lines = md.split('\n');
    const h = lines.find((l) => l.startsWith('| Паттерн |'))!;
    const sep = lines[lines.indexOf(h) + 1];
    expect(sep.split('|').length).toBe(h.split('|').length);
    const row = lines.find((l) => l.startsWith('| harmonic-pattern |'))!;
    expect(row.split('|').length).toBe(h.split('|').length);
  });
});
