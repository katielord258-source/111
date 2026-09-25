import { describe, it, expect } from 'vitest';
import {
  computeWalkForwardResult,
  dedupeOccurrences,
  seedNoDetectionGroups,
  selectBestExpiry,
  type Occurrence,
} from './horizon-audit';
import { computeFoldBoundaries, assignFoldIndex } from './horizon-partitioning';
import type { SignalDirection } from '@/types/domain';

/**
 * Строит синтетические occurrences с ПОЛНОСТЬЮ предсказуемым исходом на
 * заданном expiry (outcome=1 для всех) — используется, чтобы убедиться,
 * что агрегация по фолдам действительно находит сигнал, когда он есть.
 */
function makeOccurrence(
  i: number,
  direction: SignalDirection,
  winningExpiry: number,
  allExpiries: number[],
): Occurrence {
  const time = i * 10;
  const outcomes = new Map<number, number>();
  for (const e of allExpiries) {
    // Только winningExpiry всегда даёт win (1); остальные — детерминированный
    // 50/50 шум по индексу occurrence `i` (не по `time`, который всегда
    // кратен 10 и потому давал бы одно и то же значение для любого `% 2`).
    outcomes.set(e, e === winningExpiry ? 1 : (i % 2 === 0 ? 1 : -1));
  }
  return {
    patternName: 'inside-bar',
    setupType: null,
    direction,
    symbolId: 'SYNTH',
    barIndex: time,
    time,
    entryPrice: 1.0,
    confidence: 0.6,
    partition: 'train',
    fold: 0,
    outcomes,
  };
}

describe('accuracyForExpiry / selectBestExpiry (sanity, unaffected by merge)', () => {
  it('picks the expiry with highest accuracy on the given occurrence set', () => {
    const grid = [1, 2, 3];
    const occs = [
      makeOccurrence(0, 'buy', 2, grid),
      makeOccurrence(1, 'buy', 2, grid),
      makeOccurrence(2, 'buy', 2, grid),
      makeOccurrence(3, 'buy', 2, grid),
    ];
    const best = selectBestExpiry(occs, grid);
    expect(best).not.toBeNull();
    expect(best!.bestExpiry).toBe(2);
    expect(best!.bestAccuracy).toBe(1);
  });
});

describe('computeWalkForwardResult (bugfix 2026-09-17)', () => {
  it('accumulates a non-trivial train pool from PRIOR folds, not just a purge sliver of the current fold', () => {
    // 500 occurrences spread evenly over time [0, 4990], 5 folds.
    // A genuine walk-forward should give fold k (k>=1) a train pool of
    // roughly k/5 * 500 occurrences — NOT a tiny purge-sized sliver.
    const grid = [1, 2, 3];
    const occs: Occurrence[] = [];
    for (let i = 0; i < 500; i++) {
      occs.push(makeOccurrence(i, 'buy', 2, grid));
    }
    const boundaries = computeFoldBoundaries(0, 4990, 5);
    assignFoldIndex(occs, boundaries);

    const result = computeWalkForwardResult(occs, grid, boundaries, /* purgeSeconds */ 0, /* minTrainSamples */ 10);

    // 4 folds evaluated (fold 0 skipped as warm-up).
    expect(result.perFold).toHaveLength(4);
    // Fold 1's train pool is fold 0 only (~100 occs) — much larger than a
    // "purge sliver" (which the old buggy implementation would have made
    // just a handful of observations, or zero at purge=0).
    const fold1 = result.perFold.find((f) => f.fold === 1)!;
    expect(fold1.trainCount).toBeGreaterThan(50);
    // Fold 4's train pool accumulates folds 0-3 (~400 occs) — strictly
    // larger than fold 1's, proving accumulation across folds (the bug
    // this test guards against produced the SAME tiny train size for
    // every fold, since it never looked at prior folds at all).
    const fold4 = result.perFold.find((f) => f.fold === 4)!;
    expect(fold4.trainCount).toBeGreaterThan(fold1.trainCount);
  });

  it('finds the true winning expiry via aggregated out-of-sample test accuracy', () => {
    const grid = [1, 2, 3];
    const occs: Occurrence[] = [];
    for (let i = 0; i < 500; i++) {
      occs.push(makeOccurrence(i, 'buy', 2, grid));
    }
    const boundaries = computeFoldBoundaries(0, 4990, 5);
    assignFoldIndex(occs, boundaries);

    const result = computeWalkForwardResult(occs, grid, boundaries, 0, 10);

    expect(result.modalBestExpiry).toBe(2);
    expect(result.aggregatedDecided).toBeGreaterThan(0);
    // Every fold's test accuracy at the (correctly) selected expiry=2
    // should be 100%, since outcomes.set(2, 1) unconditionally.
    expect(result.aggregatedWins).toBe(result.aggregatedDecided);
  });

  it('skips a fold entirely when its accumulated train pool is below minTrainSamples', () => {
    const grid = [1, 2, 3];
    const occs: Occurrence[] = [];
    for (let i = 0; i < 500; i++) {
      occs.push(makeOccurrence(i, 'buy', 2, grid));
    }
    const boundaries = computeFoldBoundaries(0, 4990, 5);
    assignFoldIndex(occs, boundaries);

    // minTrainSamples so high that only the last fold or two could ever
    // qualify — earlier folds must be skipped (bestExpiryBars: null),
    // not crash and not silently include them.
    const result = computeWalkForwardResult(occs, grid, boundaries, 0, 150);
    const fold1 = result.perFold.find((f) => f.fold === 1)!;
    expect(fold1.bestExpiryBars).toBeNull();
    expect(fold1.testDecided).toBe(0);
  });

  it('purge gap excludes training occurrences too close to the test fold boundary', () => {
    const grid = [1, 2, 3];
    const occs: Occurrence[] = [];
    for (let i = 0; i < 500; i++) {
      occs.push(makeOccurrence(i, 'buy', 2, grid));
    }
    const boundaries = computeFoldBoundaries(0, 4990, 5);
    assignFoldIndex(occs, boundaries);

    const noPurge = computeWalkForwardResult(occs, grid, boundaries, 0, 10);
    const withPurge = computeWalkForwardResult(occs, grid, boundaries, /* purgeSeconds */ 500, 10);

    const fold1NoPurge = noPurge.perFold.find((f) => f.fold === 1)!;
    const fold1WithPurge = withPurge.perFold.find((f) => f.fold === 1)!;
    // A purge gap must strictly shrink (or leave equal, at the margins)
    // the train pool available to a given fold — never grow it.
    expect(fold1WithPurge.trainCount).toBeLessThanOrEqual(fold1NoPurge.trainCount);
  });

  it('returns no occurrences evaluated (empty perFold) gracefully for a single-fold boundary set', () => {
    const grid = [1, 2, 3];
    const occs = [makeOccurrence(0, 'buy', 2, grid)];
    const boundaries = computeFoldBoundaries(0, 0, 1); // degenerate: zero span
    const result = computeWalkForwardResult(occs, grid, boundaries, 0, 10);
    expect(result.perFold).toHaveLength(0);
    expect(result.modalBestExpiry).toBeNull();
    expect(result.aggregatedDecided).toBe(0);
  });
});


// ── Сверка 2026-09-20: дедупликация и паттерны без срабатываний ───────────
function occAt(symbolId: string, direction: SignalDirection, barIndex: number): Occurrence {
  return {
    patternName: 'harmonic-pattern',
    setupType: null,
    direction,
    symbolId,
    barIndex,
    time: barIndex * 60,
    entryPrice: 1.0,
    confidence: 0.6,
    partition: 'train',
    fold: 0,
    outcomes: new Map<number, number>(),
  };
}

describe('dedupeOccurrences', () => {
  it('collapses 30 consecutive-bar detections of one pattern instance into one independent observation', () => {
    const occs = Array.from({ length: 30 }, (_, k) => occAt('EURUSD', 'buy', 100 + k)); // бары 100..129
    const kept = dedupeOccurrences(occs, 30);
    expect(kept).toHaveLength(1);
    expect(kept[0].barIndex).toBe(100);
  });

  it('keeps a later detection once the previous horizon has ended (gap > minGapBars)', () => {
    const kept = dedupeOccurrences([occAt('EURUSD', 'buy', 100), occAt('EURUSD', 'buy', 130), occAt('EURUSD', 'buy', 131)], 30);
    expect(kept.map((o) => o.barIndex)).toEqual([100, 131]); // 130-100 = 30 — ещё не > 30
  });

  it('treats different symbols and directions independently and is order-insensitive', () => {
    const occs = [
      occAt('GBPUSD', 'buy', 101), occAt('EURUSD', 'sell', 100), occAt('EURUSD', 'buy', 100),
      occAt('EURUSD', 'buy', 101), occAt('GBPUSD', 'buy', 100),
    ];
    const kept = dedupeOccurrences(occs, 30);
    expect(kept).toHaveLength(3); // EURUSD/buy, EURUSD/sell, GBPUSD/buy
  });

  it('does not mutate its input', () => {
    const occs = [occAt('EURUSD', 'buy', 105), occAt('EURUSD', 'buy', 100)];
    dedupeOccurrences(occs, 30);
    expect(occs.map((o) => o.barIndex)).toEqual([105, 100]);
  });
});

describe('seedNoDetectionGroups', () => {
  it('adds an empty group for every evaluated pattern that has no group at all (any setupType)', () => {
    const groups = new Map<string, Occurrence[]>([
      ['inside-bar|', [occAt('EURUSD', 'buy', 1)]],
      ['liquidity-sweep|continuation', [occAt('EURUSD', 'buy', 2)]],
    ]);
    seedNoDetectionGroups(groups, ['inside-bar', 'liquidity-sweep', 'bullish-engulfing', 'morning-star']);
    expect(groups.get('bullish-engulfing|')).toEqual([]);
    expect(groups.get('morning-star|')).toEqual([]);
    expect(groups.has('liquidity-sweep|')).toBe(false); // у него есть группа с setupType — не досеиваем
    expect(groups.get('inside-bar|')).toHaveLength(1); // существующее не тронуто
    expect(groups.size).toBe(4);
  });
});
