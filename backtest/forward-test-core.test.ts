import { describe, it, expect } from 'vitest';
import type { Candle } from '@/types/domain';
import { FORWARD_TEST_RULES, type ForwardTestRule } from './forward-test-registry';
import {
  breakevenRate, calibrateThreshold, extractForwardEvents, summarizeEvents, judge, validateRule, type ForwardEvent,
} from './forward-test-core';
import { buildCandidates } from './continuation';

const RULE: ForwardTestRule = { ...FORWARD_TEST_RULES['reversal-top1pct-v1'], forwardStartUtc: '2026-01-01T00:00:00Z', registeredOn: '2025-12-31' };
const T0 = Date.UTC(2026, 0, 1) / 1000;

function flat(n: number, t0 = T0, price = 100): Candle[] {
  return Array.from({ length: n }, (_, i) => ({ time: t0 + i * 60, open: price, close: price + (i % 2 ? 0.01 : -0.01), high: price + 0.02, low: price - 0.02, volume: 0 }));
}

describe('breakevenRate', () => {
  it('80% → 55.56%', () => expect(breakevenRate(80)).toBeCloseTo(100 / 180, 6));
});

describe('extractForwardEvents', () => {
  it('крупная свеча вверх, следующий бар идёт вниз → выигрыш разворота; вход по open следующего бара', () => {
    const cs = flat(60);
    cs[40] = { time: cs[40].time, open: 100, close: 101, high: 101.02, low: 99.98, volume: 0 }; // большое тело вверх
    cs[41] = { time: cs[41].time, open: 101, close: 100.5, high: 101.02, low: 100.4, volume: 0 }; // вниз от open входа
    const ev = extractForwardEvents('X', cs, 0.5, RULE);
    const e = ev.find((x) => x.time === cs[40].time)!;
    expect(e).toBeDefined();
    expect(e.win).toBe(true);
  });

  it('ничья (close == open следующего бара) не считается решённой', () => {
    const cs = flat(60);
    cs[40] = { time: cs[40].time, open: 100, close: 101, high: 101.02, low: 99.98, volume: 0 };
    cs[41] = { time: cs[41].time, open: 101, close: 101, high: 101.02, low: 100.9, volume: 0 };
    const e = extractForwardEvents('X', cs, 0.5, RULE).find((x) => x.time === cs[40].time)!;
    expect(e.win).toBeNull();
  });

  it('события до forwardStartUtc не учитываются', () => {
    const cs = flat(60, T0 - 3600);
    cs[10] = { time: cs[10].time, open: 100, close: 101, high: 101.02, low: 99.98, volume: 0 };
    cs[11] = { ...cs[11], open: 101, close: 100.5 };
    expect(extractForwardEvents('X', cs, 0.5, RULE).some((x) => x.time === cs[10].time)).toBe(false);
  });

  it('слабые свечи ниже порога не дают событий', () => {
    expect(extractForwardEvents('X', flat(60), 50, RULE)).toHaveLength(0);
  });
});

describe('calibrateThreshold', () => {
  it('совпадает с 99-м перцентилем силы из buildCandidates (то же определение, что в диагностике)', () => {
    const cs = flat(3000).map((c, i) => ({ ...c, close: c.open + Math.sin(i * 0.37) * (0.01 + (i % 97) * 0.001) }));
    const { threshold, candidates } = calibrateThreshold(cs, 14, 0.99);
    const sorted = buildCandidates(cs, 14, 1).cands.map((c) => c.strength).sort((a, b) => a - b);
    expect(candidates).toBe(sorted.length);
    expect(threshold).toBe(sorted[Math.floor(0.99 * sorted.length)]);
  });
});

function mk(n: number, winRate: number, sameHour = false): ForwardEvent[] {
  const ev: ForwardEvent[] = [];
  for (let i = 0; i < n; i++) {
    ev.push({ symbol: RULE.instruments[i % 4], time: T0 + (sameHour ? Math.floor(i / 40) : i) * 3600, win: (i * 7919) % 1000 < winRate * 1000 });
  }
  return ev;
}

describe('summarizeEvents / judge', () => {
  it('независимые события: n_eff ≈ n, 60% при n=3000 → pass', () => {
    const s = summarizeEvents(mk(3000, 0.6), RULE);
    expect(s.effectiveN).toBeGreaterThan(2500);
    expect(s.wilsonLB!).toBeGreaterThan(s.breakeven);
    expect(judge(s, RULE)).toBe('pass');
  });

  it('те же результаты, склеенные в общие часовые кластеры (40 событий на блок): n_eff падает и вердикт не pass', () => {
    // внутри блока исходы полностью совпадают → сильная зависимость
    const ev: ForwardEvent[] = [];
    for (let b = 0; b < 75; b++) {
      const win = b % 5 < 3; // 60% блоков выиграно целиком
      for (let j = 0; j < 40; j++) ev.push({ symbol: RULE.instruments[j % 4], time: T0 + b * 3600 + j * 10, win });
    }
    const s = summarizeEvents(ev, RULE);
    expect(s.decided).toBe(3000);
    expect(s.effectiveN).toBeLessThan(200);
    expect(judge(s, RULE)).toBe('fail');
  });

  it('55% при n=3000 — fail (ниже безубытка по нижней границе)', () => {
    expect(judge(summarizeEvents(mk(3000, 0.55), RULE), RULE)).toBe('fail');
  });

  it('меньше minEvents — insufficient, даже если доля высокая', () => {
    expect(judge(summarizeEvents(mk(500, 0.7), RULE), RULE)).toBe('insufficient');
  });

  it('ничьи не входят в decided', () => {
    const ev = [...mk(100, 0.5), { symbol: 'EURUSD', time: T0, win: null } as ForwardEvent];
    const s = summarizeEvents(ev, RULE);
    expect(s.decided).toBe(100);
    expect(s.ties).toBe(1);
  });
});

describe('validateRule', () => {
  it('пока пороги не заморожены (null) — evaluate/progress должны отказать', () => {
    const unfrozen = { ...RULE, thresholds: { EURUSD: null, USDJPY: null, BTCUSDT: null, ETHUSDT: null } };
    expect(validateRule(unfrozen).filter((e) => e.includes('порог')).length).toBe(4);
  });
  it('ЗАРЕГИСТРИРОВАННОЕ правило reversal-top1pct-v1 целостно: пороги заморожены, форвард после регистрации и калибровки', () => {
    expect(validateRule(FORWARD_TEST_RULES['reversal-top1pct-v1'])).toEqual([]);
  });
  it('freeze-guard: параметры зарегистрированного правила не менялись (правка = новый id и новый форвард)', () => {
    const r = FORWARD_TEST_RULES['reversal-top1pct-v1'];
    expect(r.thresholds).toEqual({ EURUSD: 2.7999999999979273, USDJPY: 2.9808612440192506, BTCUSDT: 3.3779262267042856, ETHUSDT: 3.0480535598790186 });
    expect(r.forwardStartUtc).toBe('2026-09-22T00:00:00Z');
    expect(r.expiryBars).toBe(1);
    expect(r.payoutPercent).toBe(80);
    expect(r.minEvents).toBe(1600);
    expect(r.strengthPercentile).toBe(0.99);
    expect(r.instruments).toEqual(['EURUSD', 'USDJPY', 'BTCUSDT', 'ETHUSDT']);
    expect(r.entry).toBe('next-open');
  });
  it('заполненные пороги + корректные даты — без ошибок', () => {
    const ok = { ...RULE, thresholds: { EURUSD: 3, USDJPY: 3, BTCUSDT: 3, ETHUSDT: 3 }, calibrationWindow: { from: '2025-09-01', to: '2025-12-30' } };
    expect(validateRule(ok)).toEqual([]);
  });
  it('окно калибровки, заходящее в форвард-период, отвергается', () => {
    const bad = { ...RULE, thresholds: { EURUSD: 3, USDJPY: 3, BTCUSDT: 3, ETHUSDT: 3 }, calibrationWindow: { from: '2025-09-01', to: '2026-02-01' } };
    expect(validateRule(bad).some((e) => e.includes('калибровк'))).toBe(true);
  });
});
