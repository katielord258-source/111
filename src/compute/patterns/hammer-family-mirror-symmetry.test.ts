import { describe, it, expect } from 'vitest';
import type { Candle, MarketStructure, IndicatorSnapshot } from '@/types/domain';
import type { SmartMoneyResult } from '@/compute/indicators/smart-money';
import type { SessionRegime } from '@/compute/session-regime';
import type { PatternContext } from './pattern-context';
import { detectHammer, detectShootingStar, detectInvertedHammer, detectHangingMan } from './single';

// D2 (промт "Исправление по воронке гейтов", раздел "Асимметрия RSI:
// hammer vs shooting-star"): требуемый тест — "buy-детектор на исходных
// свечах == sell-детектор на зеркально отражённых (цена → −цена, RSI →
// 100−RSI)". До этого теста в репозитории был только
// mirror-symmetry.test.ts (2026-09-20) для nextCandleConfirmation, но не
// для целых детекторов hammer-семейства — то есть сам критерий приёмки D2
// формально не проверялся.
//
// Геометрические пары под зеркалом цены (open'=-open, close'=-close,
// high'=-low, low'=-high — тот же мировой класс, см. mirror-symmetry.test.ts):
// upperWick' = lowerWick(orig), lowerWick' = upperWick(orig), body
// не меняется. Алгебраически это даёт:
//   hammer (buy, тело у верха диапазона, длинная нижняя тень, rsi<=40,
//     нисходящий контекст) ⟷ shooting-star (sell, тело у низа диапазона,
//     длинная верхняя тень, rsi>=60 после D2, восходящий контекст)
//   inverted-hammer (buy, тело у низа, длинная верхняя тень, rsi<=40,
//     нисходящий контекст) ⟷ hanging-man (sell, тело у верха, длинная
//     нижняя тень, rsi>=60, восходящий контекст)
// Hammer и hanging-man при этом — ОДНА и та же геометрия в разном
// трендовом контексте (это реальная TA-семантика, не баг), поэтому парой
// друг другу под зеркалом цены они не являются — зеркальны они со
// «своей» противоположной формой (shooting-star / inverted-hammer
// соответственно). Проверено алгебраически по коду single.ts перед
// написанием этого теста.

function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function mirrorCandle(c: Candle): Candle {
  return { ...c, open: -c.open, close: -c.close, high: -c.low, low: -c.high };
}

function mirrorTrend(t: MarketStructure['trend']): MarketStructure['trend'] {
  if (t === 'up') return 'down';
  if (t === 'down') return 'up';
  return 'range';
}

function mirrorStructure(s: MarketStructure): MarketStructure {
  return { ...s, trend: mirrorTrend(s.trend), swingHigh: null, swingLow: null };
}

const EMPTY_SMART_MONEY: SmartMoneyResult = {
  orderBlocks: [],
  fvgs: [],
  inversionFvgs: [],
  breakerBlocks: [],
  rejectionBlocks: [],
  bosEvents: [],
};

const SESSIONS: SessionRegime[] = ['sydney', 'tokyo', 'london', 'newyork', 'overlap', 'closed'];

interface Case {
  candles: Candle[];
  index: number;
  structure: MarketStructure;
  htfStructure: MarketStructure;
  session: SessionRegime;
  sessionAgnostic: boolean;
  rsi: number;
}

// Смешанная генерация: часть случаев случайны целиком (проверяют, что оба
// детектора одинаково молчат на шуме), часть намеренно смещена к форме
// hammer/shooting-star (длинная тень + маленькое тело у одного из краёв
// диапазона), чтобы значимая доля случаев реально доходила до confidence
// и числового сравнения, а не только до "оба null".
function randomCase(rnd: () => number, biasGeometry: boolean): Case {
  const n = 7; // 5 preceding + pattern + confirm
  const candles: Candle[] = [];
  let base = 100 + rnd() * 50;
  for (let i = 0; i < n - 2; i++) {
    const dir = rnd() < 0.7 ? -1 : 1; // biased so hasPrecedingBearish/Bullish triggers often
    const move = 0.2 + rnd() * 1.5;
    const open = base;
    const close = base + dir * move;
    const high = Math.max(open, close) + rnd() * 0.3;
    const low = Math.min(open, close) - rnd() * 0.3;
    candles.push({ time: i * 60, open, high, low, close, volume: 50 + rnd() * 100 });
    base = close;
  }

  let patternCandle: Candle;
  if (biasGeometry) {
    // Hammer/shooting-star-like shape: small body near one edge, one long
    // wick on the opposite side, short wick on the near side.
    const body = 0.05 + rnd() * 0.2;
    const longWick = body * (2.2 + rnd() * 3);
    const shortWick = body * rnd() * 0.4;
    const nearTop = rnd() < 0.5; // hammer/hanging-man shape vs inverted-hammer/shooting-star shape
    const open = base;
    const close = base + (rnd() < 0.5 ? 1 : -1) * body;
    const bodyTop = Math.max(open, close);
    const bodyBottom = Math.min(open, close);
    const high = nearTop ? bodyTop + shortWick : bodyTop + longWick;
    const low = nearTop ? bodyBottom - longWick : bodyBottom - shortWick;
    patternCandle = { time: (n - 2) * 60, open, high, low, close, volume: 50 + rnd() * 100 };
  } else {
    const open = base;
    const close = base + (rnd() - 0.5) * 3;
    const high = Math.max(open, close) + rnd() * 2;
    const low = Math.min(open, close) - rnd() * 2;
    patternCandle = { time: (n - 2) * 60, open, high, low, close, volume: 50 + rnd() * 100 };
  }
  candles.push(patternCandle);

  const confirmOpen = patternCandle.close;
  const confirmClose = confirmOpen + (rnd() - 0.5) * 4;
  const confirmHigh = Math.max(confirmOpen, confirmClose) + rnd() * 0.5;
  const confirmLow = Math.min(confirmOpen, confirmClose) - rnd() * 0.5;
  candles.push({ time: (n - 1) * 60, open: confirmOpen, high: confirmHigh, low: confirmLow, close: confirmClose, volume: 50 + rnd() * 100 });

  const trendOptions: MarketStructure['trend'][] = ['up', 'down', 'range'];
  const structure: MarketStructure = {
    trend: trendOptions[Math.floor(rnd() * 3)],
    bos: rnd() < 0.5,
    choch: rnd() < 0.5,
    swingHigh: null,
    swingLow: null,
    provisional: false,
  };
  const htfStructure: MarketStructure = {
    trend: trendOptions[Math.floor(rnd() * 3)],
    bos: rnd() < 0.5,
    choch: rnd() < 0.5,
    swingHigh: null,
    swingLow: null,
    provisional: false,
  };

  return {
    candles,
    index: n - 2,
    structure,
    htfStructure,
    session: SESSIONS[Math.floor(rnd() * SESSIONS.length)],
    sessionAgnostic: rnd() < 0.5,
    rsi: rnd() * 100,
  };
}

function makeIndicators(rsi: number): IndicatorSnapshot {
  return {
    rsi,
    emaFast: null,
    emaSlow: null,
    macd: null,
    macdSignal: null,
    macdHistogram: null,
    atr: null,
    bollingerUpper: null,
    bollingerMiddle: null,
    bollingerLower: null,
    vwap: null,
    vwapIsProxyVolume: false,
    volumeProfilePoc: null,
    volumeProfilePocIsProxyVolume: false,
    meanReversionRsi: null,
    impulseVelocity: null,
    adx: null,
  };
}

function toOriginalCtx(c: Case): PatternContext {
  return {
    candles: c.candles,
    index: c.index,
    structure: c.structure,
    htfStructure: c.htfStructure,
    session: c.session,
    sessionAgnostic: c.sessionAgnostic,
    smartMoney: EMPTY_SMART_MONEY,
    indicators: makeIndicators(c.rsi),
  };
}

function toMirroredCtx(c: Case): PatternContext {
  return {
    candles: c.candles.map(mirrorCandle),
    index: c.index,
    structure: mirrorStructure(c.structure),
    htfStructure: mirrorStructure(c.htfStructure),
    session: c.session,
    sessionAgnostic: c.sessionAgnostic,
    smartMoney: EMPTY_SMART_MONEY,
    indicators: makeIndicators(100 - c.rsi),
  };
}

const N = 20000;

describe('D2: зеркальная симметрия hammer-семейства (промт "Исправление по воронке гейтов")', () => {
  it('hammer(исходные свечи) == shooting-star(зеркало: цена→-цена, RSI→100-RSI), 20000 случаев', () => {
    const rnd = makeRng(20260925);
    let bothFired = 0;
    let mismatches = 0;
    for (let i = 0; i < N; i++) {
      const c = randomCase(rnd, rnd() < 0.55);
      const hammer = detectHammer(toOriginalCtx(c));
      const star = detectShootingStar(toMirroredCtx(c));
      if (hammer === null && star === null) {
        continue;
      }
      if (hammer === null || star === null) {
        mismatches++;
        continue;
      }
      bothFired++;
      expect(star.direction).toBe('sell');
      expect(hammer.direction).toBe('buy');
      expect(star.confidence).toBeCloseTo(hammer.confidence, 9);
    }
    // До D2 (нет RSI-гейта у shooting-star, разные пороги 0.45/0.50)
    // mismatches было систематически много — тест должен были падать.
    // После D2 остаются только эффекты, сознательно вне зеркала (D2 не
    // трогал: shooting-star §"reject if at support" — swingLow всегда
    // null в этом тесте, так что на этот тест он не влияет).
    expect(mismatches).toBe(0);
    expect(bothFired).toBeGreaterThan(20); // тест не должен быть тривиальным (только "оба null")
  });

  it('inverted-hammer(исходные свечи) == hanging-man(зеркало: цена→-цена, RSI→100-RSI), 20000 случаев', () => {
    const rnd = makeRng(20260925 + 1);
    let bothFired = 0;
    let mismatches = 0;
    for (let i = 0; i < N; i++) {
      const c = randomCase(rnd, rnd() < 0.55);
      const invHammer = detectInvertedHammer(toOriginalCtx(c));
      const hangingMan = detectHangingMan(toMirroredCtx(c));
      if (invHammer === null && hangingMan === null) continue;
      if (invHammer === null || hangingMan === null) {
        mismatches++;
        continue;
      }
      bothFired++;
      expect(hangingMan.direction).toBe('sell');
      expect(invHammer.direction).toBe('buy');
      expect(hangingMan.confidence).toBeCloseTo(invHammer.confidence, 9);
    }
    expect(mismatches).toBe(0);
    expect(bothFired).toBeGreaterThan(20);
  });
});
