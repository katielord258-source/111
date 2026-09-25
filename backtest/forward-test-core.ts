/**
 * Форвард-тест «разворот после крупной свечи» — чистые функции (без I/O). Правила: forward-test-registry.ts.
 * Определение силы свечи и ATR — те же, что в continuation.ts (buildCandidates): гипотеза формулировалась по ним.
 */
import type { Candle } from '@/types/domain';
import { wilsonLowerBound } from '@/lib/wilson';
import { buildCandidates } from './continuation';
import type { ForwardTestRule } from './forward-test-registry';

export interface ForwardEvent {
  symbol: string;
  /** Время сигнальной свечи (unix, сек). */
  time: number;
  /** true — сделка против свечи выиграла; null — ничья (close == open входа), в подсчёт не идёт. */
  win: boolean | null;
}

export function breakevenRate(payoutPercent: number): number {
  return 100 / (100 + payoutPercent);
}

/** 99-й (или иной) перцентиль силы на окне калибровки — тот же способ индексации, что в continuation.ts. */
export function calibrateThreshold(candles: readonly Candle[], atrPeriod: number, percentile: number): { threshold: number; candidates: number } {
  const { cands } = buildCandidates(candles, atrPeriod, 1);
  const sorted = cands.map((c) => c.strength).sort((a, b) => a - b);
  if (sorted.length === 0) return { threshold: NaN, candidates: 0 };
  return { threshold: sorted[Math.min(sorted.length - 1, Math.floor(percentile * sorted.length))], candidates: sorted.length };
}

export function extractForwardEvents(
  symbol: string,
  candles: readonly Candle[],
  threshold: number,
  rule: ForwardTestRule,
): ForwardEvent[] {
  const startSec = Math.floor(new Date(rule.forwardStartUtc).getTime() / 1000);
  const h = rule.expiryBars;
  const { cands } = buildCandidates(candles, rule.atrPeriod, h);
  const out: ForwardEvent[] = [];
  for (const c of cands) {
    if (c.strength < threshold) continue;
    if (candles[c.i].time < startSec) continue;
    const entry = candles[c.i + 1].open;
    const fwd = candles[c.i + h].close - entry;
    if (fwd === 0) { out.push({ symbol, time: candles[c.i].time, win: null }); continue; }
    const fwdDir = fwd > 0 ? 1 : -1;
    out.push({ symbol, time: candles[c.i].time, win: fwdDir === -c.dir });
  }
  return out;
}

export interface ForwardSummary {
  decided: number;
  wins: number;
  ties: number;
  winRate: number | null;
  clusters: number;
  designEffect: number;
  effectiveN: number;
  wilsonLB: number | null;
  breakeven: number;
  perSymbol: Array<{ symbol: string; decided: number; winRate: number | null }>;
}

export function summarizeEvents(events: readonly ForwardEvent[], rule: ForwardTestRule): ForwardSummary {
  const be = breakevenRate(rule.payoutPercent);
  const decidedEv = events.filter((e) => e.win !== null);
  const ties = events.length - decidedEv.length;
  const decided = decidedEv.length;
  const wins = decidedEv.filter((e) => e.win === true).length;
  const perSymbol = rule.instruments.map((symbol) => {
    const ev = decidedEv.filter((e) => e.symbol === symbol);
    return { symbol, decided: ev.length, winRate: ev.length ? ev.filter((e) => e.win === true).length / ev.length : null };
  });
  if (decided === 0) {
    return { decided, wins, ties, winRate: null, clusters: 0, designEffect: 1, effectiveN: 0, wilsonLB: null, breakeven: be, perSymbol };
  }
  const p = wins / decided;
  // Кластеры — временные блоки, общие для ВСЕХ инструментов пула (корреляция инструментов + перекрытие окон).
  const clusters = new Map<number, { w: number; d: number }>();
  for (const e of decidedEv) {
    const k = Math.floor(e.time / rule.clusterSeconds);
    const c = clusters.get(k) ?? { w: 0, d: 0 };
    c.d++;
    if (e.win) c.w++;
    clusters.set(k, c);
  }
  let v = 0;
  for (const c of clusters.values()) { const r = c.w - p * c.d; v += r * r; }
  const binVar = decided * p * (1 - p);
  const deff = binVar > 0 ? Math.max(1, v / binVar) : 1;
  const nEff = decided / deff;
  return {
    decided, wins, ties, winRate: p, clusters: clusters.size, designEffect: deff, effectiveN: Math.round(nEff),
    wilsonLB: wilsonLowerBound(p * nEff, nEff), breakeven: be, perSymbol,
  };
}

export type ForwardVerdict = 'insufficient' | 'pass' | 'fail';

/** Единственное правило вердикта: набралось minEvents → pass, если нижняя граница Уилсона (n_eff) > безубытка. */
export function judge(summary: ForwardSummary, rule: ForwardTestRule): ForwardVerdict {
  if (summary.decided < rule.minEvents) return 'insufficient';
  return summary.wilsonLB !== null && summary.wilsonLB > summary.breakeven ? 'pass' : 'fail';
}

/** Проверка целостности регистрации: пороги заполнены, форвард начинается не раньше регистрации. */
export function validateRule(rule: ForwardTestRule): string[] {
  const errs: string[] = [];
  for (const s of rule.instruments) {
    const t = rule.thresholds[s];
    if (t === null || t === undefined || !Number.isFinite(t) || t <= 0) errs.push(`порог для ${s} не заморожен (запустите calibrate и впишите значение в registry ДО старта форварда)`);
  }
  if (new Date(rule.forwardStartUtc).getTime() < new Date(rule.registeredOn).getTime()) errs.push('forwardStartUtc раньше registeredOn');
  if (new Date(rule.calibrationWindow.to).getTime() >= new Date(rule.forwardStartUtc).getTime()) errs.push('окно калибровки заходит в форвард-период');
  return errs;
}
