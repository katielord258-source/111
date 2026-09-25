import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { rm, mkdir } from 'node:fs/promises';
import { readCache, writeCache, fingerprint, CACHE_VERSION, type CacheKey } from './occurrence-cache';
import type { Occurrence } from './horizon-audit';

const CACHE_DIR = 'backtest/.cache';

const baseKey = (algorithmVersion: number): CacheKey => ({
  symbol: 'TEST',
  timeframe: '1m',
  from: '2026-01-01',
  to: '2026-01-02',
  windowSize: 100,
  maxExpiry: 3,
  activeFeatures: ['impulse-breakout'],
  config: { atrPeriod: 14 },
  algorithmVersion,
});

function sampleOccurrence(): Occurrence {
  return {
    patternName: 'impulse-breakout',
    setupType: null,
    direction: 'buy',
    symbolId: 'TEST',
    barIndex: 10,
    time: 1735689600,
    entryPrice: 100,
    confidence: 0.5,
    partition: 'train',
    fold: 0,
    outcomes: new Map([[1, 1]]),
  };
}

describe('occurrence-cache version invalidation', () => {
  beforeEach(async () => {
    await rm(CACHE_DIR, { recursive: true, force: true });
    await mkdir(CACHE_DIR, { recursive: true });
  });

  afterEach(async () => {
    await rm(CACHE_DIR, { recursive: true, force: true });
  });

  it('returns a hit when algorithmVersion matches', async () => {
    const key = baseKey(4);
    await writeCache(key, [sampleOccurrence()], { candles1m: 500, candlesResampled: 100 });
    const cached = await readCache(key);
    expect(cached).not.toBeNull();
    expect(cached!.occurrences.length).toBe(1);
  });

  it('returns null when algorithmVersion differs (stale cache must be rejected)', async () => {
    await writeCache(baseKey(3), [sampleOccurrence()], { candles1m: 500, candlesResampled: 100 });
    const cached = await readCache(baseKey(4));
    expect(cached).toBeNull();
  });

  it('fingerprints differ across algorithm versions', () => {
    expect(fingerprint(baseKey(3))).not.toBe(fingerprint(baseKey(4)));
  });

  it('exports the current CACHE_VERSION', () => {
    expect(CACHE_VERSION).toBe(4);
  });
});
