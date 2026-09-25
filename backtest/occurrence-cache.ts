import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import type { PatternName, SignalDirection } from '@/types/domain';
import type { Occurrence } from './horizon-audit';

// v3 → v4: конверт хранит candleCounts (число 1m-свечей и ресэмплированных
// свечей, полученных при построении occurrences). Раньше попадание в этот
// кэш всё равно требовало loadHistory() (сетевой запрос), чтобы узнать эти
// числа для отчёта — теперь при полном совпадении fingerprint сеть не
// нужна вообще: числа берутся из самого конверта кэша.
const CACHE_VERSION = 4;
const CACHE_DIR = 'backtest/.cache';

interface SerializableOccurrence {
  patternName: PatternName;
  setupType: string | null;
  direction: SignalDirection;
  symbolId: string;
  barIndex: number;
  time: number;
  entryPrice: number;
  confidence: number;
  partition: 'train' | 'validation' | 'test';
  fold: number;
  outcomes: [number, number][];
}

export interface CandleCounts {
  candles1m: number;
  candlesResampled: number;
}

interface CacheEnvelope {
  version: number;
  fingerprint: string;
  occurrences: SerializableOccurrence[];
  candleCounts: CandleCounts;
}

export interface CacheKey {
  symbol: string;
  timeframe: string;
  from: string;
  to: string;
  windowSize: number;
  maxExpiry: number;
  activeFeatures: readonly string[];
  config: Record<string, unknown>;
  algorithmVersion: number;
}

function fingerprint(key: CacheKey): string {
  const parts = [
    `v${CACHE_VERSION}`,
    `algo${key.algorithmVersion}`,
    key.symbol,
    key.timeframe,
    key.from,
    key.to,
    `w${key.windowSize}`,
    `e${key.maxExpiry}`,
    [...key.activeFeatures].sort().join(','),
    JSON.stringify(key.config),
  ];
  return createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 24);
}

function cachePath(key: CacheKey): string {
  return join(CACHE_DIR, `${key.symbol}-${key.timeframe}-${fingerprint(key)}.json`);
}

function serialize(occs: Occurrence[]): SerializableOccurrence[] {
  return occs.map((o) => ({
    patternName: o.patternName,
    setupType: o.setupType,
    direction: o.direction,
    symbolId: o.symbolId,
    barIndex: o.barIndex,
    time: o.time,
    entryPrice: o.entryPrice,
    confidence: o.confidence,
    partition: o.partition,
    fold: o.fold,
    outcomes: [...o.outcomes.entries()].sort((a, b) => a[0] - b[0]),
  }));
}

function deserialize(data: SerializableOccurrence[]): Occurrence[] {
  return data.map((o) => ({
    patternName: o.patternName,
    setupType: o.setupType,
    direction: o.direction,
    symbolId: o.symbolId,
    barIndex: o.barIndex,
    time: o.time,
    entryPrice: o.entryPrice,
    confidence: o.confidence,
    partition: o.partition,
    fold: o.fold,
    outcomes: new Map(o.outcomes),
  }));
}

export interface CachedOccurrences {
  occurrences: Occurrence[];
  candleCounts: CandleCounts;
}

export async function readCache(key: CacheKey): Promise<CachedOccurrences | null> {
  try {
    const raw = await readFile(cachePath(key), 'utf-8');
    const envelope = JSON.parse(raw) as CacheEnvelope;
    if (envelope.version !== CACHE_VERSION) return null;
    if (envelope.fingerprint !== fingerprint(key)) return null;
    if (!envelope.candleCounts) return null;
    return { occurrences: deserialize(envelope.occurrences), candleCounts: envelope.candleCounts };
  } catch {
    return null;
  }
}

export async function writeCache(key: CacheKey, occs: Occurrence[], candleCounts: CandleCounts): Promise<void> {
  const path = cachePath(key);
  const tmp = path + '.tmp';
  const envelope: CacheEnvelope = {
    version: CACHE_VERSION,
    fingerprint: fingerprint(key),
    occurrences: serialize(occs),
    candleCounts,
  };
  await mkdir(dirname(path), { recursive: true });
  await writeFile(tmp, JSON.stringify(envelope), 'utf-8');
  await rename(tmp, path);
}

export { fingerprint, CACHE_VERSION };
