import { describe, it, expect } from 'vitest';
import {
  assignHoldoutPartitions,
  computeFoldBoundaries,
  assignFoldIndex,
  type Partitionable,
} from './horizon-partitioning';

function makeOccs(times: number[]): Partitionable[] {
  return times.map((t) => ({ time: t, partition: 'train' as const, fold: 0 }));
}

describe('assignHoldoutPartitions', () => {
  it('splits chronologically by global timestamp into 60/20/20', () => {
    const occs = makeOccs([0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
    assignHoldoutPartitions(occs);
    const train = occs.filter((o) => o.partition === 'train');
    const val = occs.filter((o) => o.partition === 'validation');
    const test = occs.filter((o) => o.partition === 'test');
    expect(train.length).toBeGreaterThan(0);
    expect(val.length).toBeGreaterThan(0);
    expect(test.length).toBeGreaterThan(0);
    for (const o of train) expect(o.time).toBeLessThan(60);
    for (const o of val) expect(o.time).toBeGreaterThanOrEqual(60);
    for (const o of val) expect(o.time).toBeLessThan(80);
    for (const o of test) expect(o.time).toBeGreaterThanOrEqual(80);
  });

  it('handles pooled symbols with different date ranges by global timestamp', () => {
    const occs = makeOccs([0, 25, 50, 100, 125, 150]);
    assignHoldoutPartitions(occs);
    // span = 150, trainEnd = 90, valEnd = 120
    expect(occs[0].partition).toBe('train');
    expect(occs[1].partition).toBe('train');
    expect(occs[2].partition).toBe('train');
    expect(occs[3].partition).toBe('validation'); // 100 >= 90, < 120
    expect(occs[4].partition).toBe('test'); // 125 >= 120 -> test
    expect(occs[5].partition).toBe('test'); // 150 >= 120 -> test
  });

  it('does not crash on empty array', () => {
    const occs: Partitionable[] = [];
    assignHoldoutPartitions(occs);
    expect(occs.length).toBe(0);
  });

  it('does not crash on single element', () => {
    const occs = makeOccs([42]);
    assignHoldoutPartitions(occs);
    expect(occs[0].partition).toBe('train');
  });
});

describe('computeFoldBoundaries + assignFoldIndex (walk-forward)', () => {
  it('creates N equal-width chronological folds covering [minTime, maxTime]', () => {
    const boundaries = computeFoldBoundaries(0, 100, 5);
    expect(boundaries).toHaveLength(5);
    expect(boundaries[0].start).toBe(0);
    expect(boundaries[4].end).toBeGreaterThan(100); // inclusive of maxTime
    // Boundaries are contiguous (end of fold i === start of fold i+1)
    for (let i = 0; i < boundaries.length - 1; i++) {
      expect(boundaries[i].end).toBe(boundaries[i + 1].start);
    }
  });

  it('assigns every occurrence to exactly one fold, in chronological order', () => {
    const occs = makeOccs([0, 15, 25, 45, 65, 85, 99, 100]);
    const boundaries = computeFoldBoundaries(0, 100, 5);
    assignFoldIndex(occs, boundaries);
    for (const o of occs) {
      expect(o.fold).toBeGreaterThanOrEqual(0);
      expect(o.fold).toBeLessThan(5);
    }
    // Earlier times -> earlier (or equal) fold index than later times
    for (let i = 1; i < occs.length; i++) {
      expect(occs[i].fold).toBeGreaterThanOrEqual(occs[i - 1].fold);
    }
    // The last occurrence (time=100=maxTime) must land in the last fold,
    // not be dropped (this is exactly the off-by-one the inclusive last
    // boundary guards against).
    expect(occs[occs.length - 1].fold).toBe(4);
  });

  it('returns empty boundaries for degenerate input (zero span or zero folds)', () => {
    expect(computeFoldBoundaries(50, 50, 5)).toHaveLength(0);
    expect(computeFoldBoundaries(0, 100, 0)).toHaveLength(0);
  });

  it('the caller can reconstruct a genuine walk-forward split: train(fold<k) vs test(fold===k)', () => {
    // This is the invariant horizon-audit.ts relies on: for evaluating
    // fold k, ALL occurrences from earlier folds are available as train
    // data (not just a small purge-sized sliver within fold k itself,
    // which was the bug in the pre-merge implementation).
    const times: number[] = [];
    for (let i = 0; i < 100; i++) times.push(i);
    const occs = makeOccs(times);
    const boundaries = computeFoldBoundaries(0, 99, 5);
    assignFoldIndex(occs, boundaries);

    const k = 3;
    const train = occs.filter((o) => o.fold < k);
    const test = occs.filter((o) => o.fold === k);
    // Train pool spans folds 0,1,2 — roughly 60% of the data, not a thin
    // purge sliver of fold 3 itself.
    expect(train.length).toBeGreaterThan(50);
    expect(test.length).toBeGreaterThan(0);
    // No overlap between train and test for this fold.
    const trainTimes = new Set(train.map((o) => o.time));
    for (const o of test) expect(trainTimes.has(o.time)).toBe(false);
  });
});
