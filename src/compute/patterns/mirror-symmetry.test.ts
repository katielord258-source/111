import { describe, it, expect } from 'vitest';
import type { Candle } from '@/types/domain';
import { nextCandleConfirmation } from './pattern-context';

// Тест зеркальной симметрии buy/sell (сверка 2026-09-20).
// Зеркало: цена p → -p (open/close меняют знак, high и low меняются местами).
// Любой детектор/функция подтверждения, которая «симметрична по замыслу»,
// обязана давать одинаковый результат для buy на исходных свечах и для sell на
// зеркальных. Ровно эта проверка поймала бы баг с weakClose в sell-ветке
// nextCandleConfirmation (замер до правки: buy подтверждался в 45.2% случаев,
// sell — в 58.7%).

function mirror(c: Candle): Candle {
  return { ...c, open: -c.open, high: -c.low, low: -c.high, close: -c.close };
}

// Детерминированный ГПСЧ (LCG) — тест воспроизводим.
function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function randomCandle(rnd: () => number, base: number, time: number): Candle {
  const range = 0.2 + rnd() * 2;
  const low = base + (rnd() - 0.5) * 2;
  const high = low + range;
  const a = low + rnd() * range;
  const b = low + rnd() * range;
  return { time, open: a, close: b, high, low, volume: 100 };
}

describe('nextCandleConfirmation — зеркальная симметрия buy/sell', () => {
  it('buy на исходных свечах == sell на зеркальных (20000 случайных пар)', () => {
    const rnd = makeRng(20260920);
    let confirmedBuy = 0;
    let confirmedSell = 0;
    for (let i = 0; i < 20000; i++) {
      const pc = randomCandle(rnd, 100, 1000);
      // подтверждающая свеча: close равномерно в [low - 0.5R, high + 0.5R]
      const range = pc.high - pc.low;
      const closeC = pc.low - 0.5 * range + rnd() * 2 * range;
      const cc: Candle = {
        time: 1060,
        open: pc.close,
        close: closeC,
        high: Math.max(pc.close, closeC) + rnd() * 0.1,
        low: Math.min(pc.close, closeC) - rnd() * 0.1,
        volume: 100,
      };
      const buy = nextCandleConfirmation(pc, cc, 'buy');
      const sell = nextCandleConfirmation(mirror(pc), mirror(cc), 'sell');
      expect(sell.confirmed).toBe(buy.confirmed);
      expect(sell.contradicted).toBe(buy.contradicted);
      expect(sell.multiplier).toBe(buy.multiplier);
      if (buy.confirmed) confirmedBuy++;
      if (sell.confirmed) confirmedSell++;
    }
    // Sanity: тест не вырожден (подтверждений достаточно много и не 100%).
    expect(confirmedBuy).toBeGreaterThan(2000);
    expect(confirmedBuy).toBeLessThan(18000);
    expect(confirmedSell).toBe(confirmedBuy);
  });
});
