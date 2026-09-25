import { describe, it, expect } from 'vitest';
import { auditFeatureSet, HORIZON_GRIDS, OCCURRENCE_ALGORITHM_VERSION } from './horizon-audit';
import { OCCURRENCE_ALGORITHM_VERSION as VERSION_FROM_LIGHT_MODULE } from './audit-version';
import { ALL_INDICATOR_FEATURES } from '@/stores/settingsStore';
import { computeIndicatorSeriesRaw, snapshotFromSeries } from '@/compute/IndicatorAggregator';
import { DEFAULT_INDICATOR_CONFIG } from '@/types/domain';
import type { Candle } from '@/types/domain';

function walk(n: number): Candle[] {
  const out: Candle[] = [];
  let p = 100;
  let seed = 7;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  for (let i = 0; i < n; i++) {
    const o = p;
    p += (rnd() - 0.5) * 0.4;
    out.push({ time: 1_700_000_000 + i * 60, open: o, high: Math.max(o, p) + 0.05, low: Math.min(o, p) - 0.05, close: p, volume: 0 });
  }
  return out;
}

describe('auditFeatureSet', () => {
  it('live: индикаторы аудита ТОЧНО совпадают с включёнными у пользователя по умолчанию', () => {
    const live = auditFeatureSet('live');
    expect([...live.indicatorFeatures].sort()).toEqual([...ALL_INDICATOR_FEATURES].sort());
  });

  it('none: прежнее поведение — только имена паттернов', () => {
    const none = auditFeatureSet('none');
    expect(none.indicatorFeatures).toEqual([]);
    expect(none.activeFeatures).toEqual(none.patternFeatures);
  });

  it('набор паттернов не зависит от режима и целиком из HORIZON_GRIDS (без doji/spinning-top)', () => {
    const live = auditFeatureSet('live');
    const none = auditFeatureSet('none');
    expect(live.patternFeatures).toEqual(none.patternFeatures);
    for (const f of live.patternFeatures) expect(HORIZON_GRIDS[f]).toBeDefined();
    expect(live.patternFeatures).not.toContain('doji');
    expect(live.patternFeatures).not.toContain('spinning-top');
    expect(new Set(live.activeFeatures).size).toBe(live.activeFeatures.length); // без дублей
  });

  it('РЕГРЕССИЯ: без индикаторных фич bollinger в снапшоте = null (mean-reversion не мог сработать); с live-набором — посчитан', () => {
    const candles = walk(300);
    const cfg = { ...DEFAULT_INDICATOR_CONFIG };
    const before = snapshotFromSeries(computeIndicatorSeriesRaw(candles, cfg, auditFeatureSet('none').activeFeatures), 250);
    expect(before.bollingerUpper).toBeNull();
    expect(before.emaFast).toBeNull();

    const after = snapshotFromSeries(computeIndicatorSeriesRaw(candles, cfg, auditFeatureSet('live').activeFeatures), 250);
    expect(after.bollingerUpper).not.toBeNull();
    expect(after.bollingerLower).not.toBeNull();
    expect(after.emaFast).not.toBeNull();
    expect(after.macd).not.toBeNull();
    expect(after.rsi).not.toBeNull();
    expect(after.atr).not.toBeNull();
    expect(after.adx).not.toBeNull();
    expect(after.meanReversionRsi).not.toBeNull();
  });
});

describe('версия алгоритма', () => {
  it('re-export из horizon-audit совпадает с лёгким модулем и поднята до 5 (изменился набор индикаторов аудита)', () => {
    expect(OCCURRENCE_ALGORITHM_VERSION).toBe(VERSION_FROM_LIGHT_MODULE);
    expect(OCCURRENCE_ALGORITHM_VERSION).toBeGreaterThanOrEqual(5);
  });
});
