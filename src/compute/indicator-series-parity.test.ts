import { describe, expect, it } from 'vitest';
import { computeIndicators, computeIndicatorSeriesRaw, snapshotFromSeries } from './IndicatorAggregator';
import { DEFAULT_INDICATOR_CONFIG } from '@/types/domain';
import type { Candle, FeatureName } from '@/types/domain';

// computeIndicatorSeriesRaw дублирует гейтинг фич из computeIndicators.
// Дублирование сознательное (серия не должна тащить за собой зип по времени
// и не причинные поля), но расхождение гейтов означало бы, что бэктест и
// продакшен считают разный набор индикаторов. Тест это фиксирует.

function synthetic(n: number): Candle[] {
  const candles: Candle[] = [];
  let price = 100;
  let seed = 1234567;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  for (let i = 0; i < n; i++) {
    const drift = (rand() - 0.48) * 0.8;
    const open = price;
    const close = price + drift;
    const high = Math.max(open, close) + rand() * 0.3;
    const low = Math.min(open, close) - rand() * 0.3;
    candles.push({ time: 1_700_000_000 + i * 60, open, high, low, close, volume: 100 + rand() * 50 });
    price = close;
  }
  return candles;
}

const CASES: { name: string; features: FeatureName[] }[] = [
  { name: 'пусто', features: [] },
  { name: 'rsi', features: ['rsi'] },
  { name: 'ema', features: ['ema'] },
  { name: 'macd', features: ['macd'] },
  { name: 'atr', features: ['atr'] },
  { name: 'bollinger', features: ['bollinger'] },
  { name: 'mean-reversion', features: ['mean-reversion'] },
  { name: 'macd-deceleration-continuation', features: ['macd-deceleration-continuation'] },
  { name: 'всё сразу', features: ['rsi', 'ema', 'macd', 'atr', 'bollinger', 'mean-reversion'] },
];

const CAUSAL_FIELDS = [
  'rsi',
  'emaFast',
  'emaSlow',
  'macd',
  'macdSignal',
  'macdHistogram',
  'atr',
  'bollingerUpper',
  'bollingerMiddle',
  'bollingerLower',
  'meanReversionRsi',
  'adx',
] as const;

describe('computeIndicatorSeriesRaw ↔ computeIndicators: паритет гейтинга фич', () => {
  const candles = synthetic(400);
  const last = candles.length - 1;

  for (const { name, features } of CASES) {
    it(`${name}: одинаковый набор посчитанных индикаторов`, () => {
      const viaSnapshot = computeIndicators(candles, DEFAULT_INDICATOR_CONFIG, features).snapshot;
      const viaSeries = snapshotFromSeries(
        computeIndicatorSeriesRaw(candles, DEFAULT_INDICATOR_CONFIG, features),
        last,
      );
      for (const field of CAUSAL_FIELDS) {
        expect(
          viaSeries[field] === null,
          `${name}/${field}: серия ${viaSeries[field] === null ? 'не посчитана' : 'посчитана'}, ` +
            `snapshot ${viaSnapshot[field] === null ? 'не посчитан' : 'посчитан'}`,
        ).toBe(viaSnapshot[field] === null);
      }
    });

    it(`${name}: одинаковые значения на последнем баре полного массива`, () => {
      const viaSnapshot = computeIndicators(candles, DEFAULT_INDICATOR_CONFIG, features).snapshot;
      const viaSeries = snapshotFromSeries(
        computeIndicatorSeriesRaw(candles, DEFAULT_INDICATOR_CONFIG, features),
        last,
      );
      for (const field of CAUSAL_FIELDS) {
        const a = viaSnapshot[field];
        const b = viaSeries[field];
        if (a === null || b === null) continue;
        expect(Math.abs(a - b), `${name}/${field}`).toBeLessThan(1e-9);
      }
    });
  }
});
