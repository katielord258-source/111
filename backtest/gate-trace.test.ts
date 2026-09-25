import { describe, it, expect } from 'vitest';
import { beginGateTrace, endGateTrace, gate, isGateTraceActive } from '@/compute/patterns/gate-trace';
import { auditFeatureSet, buildOccurrences, formatGateFunnel, HORIZON_GRIDS } from './horizon-audit';
import { generateRandomWalk } from './synthetic/random-walk';
import { DEFAULT_INDICATOR_CONFIG } from '@/types/domain';

describe('gate-trace', () => {
  it('вне трассировки gate() ничего не делает и не накапливает', () => {
    expect(isGateTraceActive()).toBe(false);
    gate('x:00');
    beginGateTrace();
    expect(endGateTrace().size).toBe(0);
  });

  it('внутри трассировки считает вызовы; endGateTrace сбрасывает состояние', () => {
    beginGateTrace();
    expect(isGateTraceActive()).toBe(true);
    gate('a:00');
    gate('a:00');
    gate('a:01');
    const counts = endGateTrace();
    expect(counts.get('a:00')).toBe(2);
    expect(counts.get('a:01')).toBe(1);
    expect(isGateTraceActive()).toBe(false);
    gate('a:00'); // после завершения — снова no-op
    expect(endGateTrace().size).toBe(0);
  });
});

describe('formatGateFunnel', () => {
  it('группирует по детектору, считает % от вызовов и отсев на гейте', () => {
    const lines = formatGateFunnel({
      'hammer:00-evaluated': 1000,
      'hammer:01-context': 400,
      'hammer:02-session': 300,
      'mean-reversion:00-evaluated': 50,
    }).join('\n');
    expect(lines).toContain('### hammer');
    expect(lines).toContain('### mean-reversion');
    expect(lines).toContain('| 01-context | 400 | 40.000% | 600 |');
    expect(lines).toContain('| 02-session | 300 | 30.000% | 100 |');
    expect(lines).toContain('| 00-evaluated | 1000 | 100.000% | — |');
  });

  it('пустой ввод — пустой вывод', () => {
    expect(formatGateFunnel({})).toEqual([]);
  });
});

describe('инструментация детекторов не меняет результат', () => {
  it('occurrences с включённой трассировкой идентичны occurrences без неё; воронка монотонна', { timeout: 90000 }, () => {
    const candles = generateRandomWalk({ bars: 4500, seed: 21, noiseFraction: 0.1 });
    const { activeFeatures } = auditFeatureSet('live');
    const maxExpiry = Math.max(...Object.values(HORIZON_GRIDS).flat());
    const run = () =>
      buildOccurrences(candles, 'SYNTH', activeFeatures, { ...DEFAULT_INDICATOR_CONFIG }, 500, maxExpiry, () => {});

    const plain = run();
    beginGateTrace();
    const traced = run();
    const counts = endGateTrace();

    const project = (o: (typeof plain)[number]) => [o.patternName, o.setupType, o.direction, o.barIndex, [...o.outcomes.entries()]];
    expect(traced.map(project)).toEqual(plain.map(project));

    // Все пять инструментированных детекторов вызывались.
    for (const name of ['hammer', 'inverted-hammer', 'hanging-man', 'shooting-star', 'mean-reversion']) {
      expect(counts.get(`${name}:00-evaluated`), `${name} должен быть вызван`).toBeGreaterThan(0);
    }
    // Воронка монотонно не возрастает по этапам каждого детектора
    // (за исключением mean-reversion:05/06, где этапы 05 объединяют две ветки).
    const byDet = new Map<string, [string, number][]>();
    for (const [k, v] of counts) {
      const [det, stage] = k.split(':');
      if (!byDet.has(det)) byDet.set(det, []);
      byDet.get(det)!.push([stage, v]);
    }
    for (const [det, stages] of byDet) {
      stages.sort(([a], [b]) => (a < b ? -1 : 1));
      for (let i = 1; i < stages.length; i++) {
        expect(stages[i][1], `${det}: ${stages[i][0]} не может превышать ${stages[i - 1][0]}`).toBeLessThanOrEqual(stages[i - 1][1]);
      }
    }
  });
});
