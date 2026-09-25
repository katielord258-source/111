/**
 * Диагностика «условного продолжения» — чистые функции (без I/O).
 *
 * Зачем. Микроструктурный аудит показал: безусловная автокорреляция минутных доходностей
 * почти нулевая (ρ₁ ≈ −0.005…+0.002, VR(2) ≈ 1), то есть простое «дребезжание» котировок
 * НЕ объясняет, почему паттерны продолжения движения на 1m стабильно проигрывают 50%.
 * Остаётся проверить два других объяснения:
 *   (а) условный эффект — после КРУПНОЙ свечи (импульса) следующие бары идут против неё чаще,
 *       хотя в среднем по всем барам автокорреляции нет;
 *   (б) артефакт измерения (правило входа/исхода, ничьи, знак).
 *
 * Что считается. Для каждой свечи i с телом |close−open| > 0 берём направление d = sign(close−open)
 * и «силу» = тело / ATR(14) предыдущих баров. Свечи делятся на корзины по перцентилям силы.
 * Для горизонта h «выигрыш» = sign(close[i+h] − close[i]) == d (ничьи, close[i+h]==close[i],
 * исключаются, как в horizon-audit).
 *   • expected — точность, которую дало бы НЕЗАВИСИМОЕ направление при тех же долях вверх/вниз:
 *     pu·q + (1−pu)(1−q), где pu — доля свечей вверх в корзине, q — доля движений вверх через h.
 *     excess = accuracy − expected: положительный — продолжение, отрицательный — разворот.
 *   • control — точность СЛУЧАЙНОГО знака на тех же барах (детерминированный seed); должна быть ≈50%.
 *     Если control заметно отклоняется — в измерении есть артефакт, и остальным цифрам верить нельзя.
 *   • p-value — кластерно-устойчивый тест (значимость.ts) относительно expected: кластеры — временные
 *     блоки ≥ 60 минут и ≥ 2·h баров, поэтому перекрытие соседних окон не завышает значимость.
 *
 * Это диагностика, а не торговая стратегия: даже значимый разворот после импульса не означает
 * прибыльность (безубыточность при выплате 80% — 55.56%, спред и часть эффекта — свойство котировки).
 */
import type { Candle } from '@/types/domain';
import { MIN_SAMPLES_FOR_SIGNIFICANCE } from './significance';

interface ClusterCount { wins: number; decided: number }
const MIN_CLUSTERS = 30;

function erf(x: number): number {
  const ax = Math.abs(x);
  let r: number;
  if (ax < 3) {
    let sum = ax, term = ax;
    for (let n = 1; n < 100; n++) {
      term *= -(ax * ax) / n;
      const add = term / (2 * n + 1);
      sum += add;
      if (Math.abs(add) < 1e-17) break;
    }
    r = (2 / Math.sqrt(Math.PI)) * sum;
  } else {
    let f = 0;
    for (let k = 60; k >= 1; k--) f = k / 2 / (ax + f);
    r = 1 - Math.exp(-ax * ax) / Math.sqrt(Math.PI) / (ax + f);
  }
  return x < 0 ? -r : r;
}

/**
 * Кластерно-устойчивый score-тест относительно baseline: T = Σ(W_c − b·D_c), Var = Σ(W_c − b·D_c)².
 * Кластеры (временные блоки) считаются независимыми; соседние перекрывающиеся окна внутри блока — нет.
 * Двусторонний: знак z показывает направление (z<0 — точность НИЖЕ baseline).
 */
function clusteredSignTest(clusters: ClusterCount[], baseline: number, _alpha: number): { z: number; pValue: number; clusters: number; deff: number } {
  const active = clusters.filter((c) => c.decided > 0);
  let decided = 0, t = 0, v = 0;
  for (const c of active) {
    decided += c.decided;
    const r = c.wins - baseline * c.decided;
    t += r;
    v += r * r;
  }
  if (decided < MIN_SAMPLES_FOR_SIGNIFICANCE || active.length < MIN_CLUSTERS || v <= 0) {
    return { z: NaN, pValue: NaN, clusters: active.length, deff: NaN };
  }
  const z = t / Math.sqrt(v);
  const binVar = decided * baseline * (1 - baseline);
  const deff = binVar > 0 ? Math.max(1, v / binVar) : 1;
  const az = Math.abs(z);
  const pValue = az > 8 ? 0 : Math.min(1, Math.max(0, 1 - erf(az / Math.SQRT2)));
  return { z, pValue, clusters: active.length, deff };
}

export interface ContinuationConfig {
  horizons: number[];
  /** Границы корзин по перцентилям силы свечи, 0..1 (строго возрастающие, начиная с 0 и до 1). */
  bucketEdges: number[];
  atrPeriod: number;
  /** Длительность бара, сек (для длины кластерного блока). */
  barSeconds: number;
  seed: number;
  alpha: number;
  /**
   * Цена входа: 'close' — close свечи i (как в horizon-audit); 'next-open' — open следующего бара
   * (первый тик следующей минуты ≈ реальный вход после закрытия сигнальной свечи). Если разворот целиком
   * происходит между close[i] и open[i+1] (гэп/отскок котировки), в режиме next-open он исчезнет.
   */
  entry?: 'close' | 'next-open';
}

export const DEFAULT_CONTINUATION_CONFIG: ContinuationConfig = {
  horizons: [1, 2, 3, 5, 10],
  bucketEdges: [0, 0.5, 0.8, 0.95, 0.99, 1],
  atrPeriod: 14,
  barSeconds: 60,
  seed: 1,
  alpha: 0.05,
};

export interface ContinuationCell {
  bucket: string;
  /** null — все направления; 'buy'/'sell' — только свечи вверх/вниз (для верхних корзин). */
  direction: 'all' | 'buy' | 'sell';
  horizon: number;
  n: number;
  wins: number;
  ties: number;
  accuracy: number | null;
  expected: number | null;
  excess: number | null;
  controlAccuracy: number | null;
  z: number | null;
  pValue: number | null;
  clusters: number;
  /** n / design-effect: число «независимых» наблюдений, эквивалентное кластерной дисперсии (≤ n). */
  effectiveN: number | null;
}

export interface ContinuationResult {
  bars: number;
  candidates: number;
  dojiSkipped: number;
  cells: ContinuationCell[];
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function bucketLabel(lo: number, hi: number): string {
  return `${Math.round(lo * 100)}–${Math.round(hi * 100)}%`;
}

export interface Cand { i: number; dir: 1 | -1; strength: number; ctrl: 1 | -1 }

/**
 * Кандидаты-свечи: тело > 0, сила = тело / ATR(atrPeriod) предыдущих баров (каузально), направление тела.
 * Вынесено отдельно, чтобы форвард-тест (forward-test-core.ts) использовал ТОЧНО то же определение силы,
 * что и диагностика, по которой сформулирована гипотеза.
 * maxH — сколько баров вперёд должно существовать (последние кандидаты без полного окна отбрасываются).
 */
export function buildCandidates(
  candles: readonly Candle[],
  atrPeriod: number,
  maxH: number,
  rng: () => number = () => 0.5,
): { cands: Cand[]; doji: number } {
  const n = candles.length;
  const tr = new Array<number>(n).fill(0);
  for (let i = 1; i < n; i++) {
    const c = candles[i], p = candles[i - 1];
    tr[i] = Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close));
  }
  const cands: Cand[] = [];
  let doji = 0;
  let sum = 0;
  for (let i = 1; i < n; i++) {
    // окно TR за (i-atrPeriod .. i-1)
    sum += tr[i - 1] * (i - 1 >= 1 ? 1 : 0);
    if (i - 1 - atrPeriod >= 1) sum -= tr[i - 1 - atrPeriod];
    if (i < atrPeriod + 2 || i + maxH >= n) continue;
    const atr = sum / atrPeriod;
    const body = Math.abs(candles[i].close - candles[i].open);
    if (!(atr > 0) || !Number.isFinite(atr)) continue;
    if (body === 0) { doji++; continue; }
    cands.push({
      i,
      dir: candles[i].close > candles[i].open ? 1 : -1,
      strength: body / atr,
      ctrl: rng() < 0.5 ? 1 : -1,
    });
  }
  return { cands, doji };
}

export function computeContinuationStats(
  candles: readonly Candle[],
  cfg: ContinuationConfig = DEFAULT_CONTINUATION_CONFIG,
): ContinuationResult {
  const n = candles.length;
  const maxH = Math.max(...cfg.horizons);
  const rng = mulberry32(cfg.seed);
  const { cands, doji } = buildCandidates(candles, cfg.atrPeriod, maxH, rng);

  const sorted = cands.map((c) => c.strength).sort((a, b) => a - b);
  const q = (p: number): number => (sorted.length === 0 ? 0 : sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]);
  const edges = cfg.bucketEdges;
  const bucketOf = (s: number): number => {
    for (let b = edges.length - 2; b >= 0; b--) if (s >= q(edges[b])) return b;
    return 0;
  };
  const nb = edges.length - 1;
  const topStart = Math.max(0, nb - 2); // две верхние корзины детализируем по направлению

  const cells: ContinuationCell[] = [];
  // Доля движений вверх через h баров во ВСЕЙ корзине (оба направления свечи). Для срезов «только вверх»/
  // «только вниз» ожидание при независимости берётся отсюда: считать его по самому срезу нельзя —
  // там доля свечей вверх равна 1 (или 0), и excess вырождался бы в ноль.
  const bucketFwdUp = new Map<string, number>();
  const evaluate = (
    label: string,
    direction: 'all' | 'buy' | 'sell',
    sel: (c: Cand) => boolean,
  ): void => {
    for (const h of cfg.horizons) {
      let upCand = 0, upFwd = 0, dec = 0, wins = 0, ties = 0, cWins = 0;
      const clusters = new Map<number, ClusterCount>();
      const blockSec = Math.max(3600, 2 * h * cfg.barSeconds);
      for (const c of cands) {
        if (!sel(c)) continue;
        const entryPx = cfg.entry === 'next-open' ? candles[c.i + 1].open : candles[c.i].close;
        const fwd = candles[c.i + h].close - entryPx;
        if (fwd === 0) { ties++; continue; }
        const fwdDir = fwd > 0 ? 1 : -1;
        dec++;
        if (c.dir === 1) upCand++;
        if (fwdDir === 1) upFwd++;
        const win = fwdDir === c.dir;
        if (win) wins++;
        if (fwdDir === c.ctrl) cWins++;
        const key = Math.floor(candles[c.i].time / blockSec);
        const cl = clusters.get(key) ?? { wins: 0, decided: 0 };
        cl.decided++;
        if (win) cl.wins++;
        clusters.set(key, cl);
      }
      if (dec === 0) {
        cells.push({ bucket: label, direction, horizon: h, n: 0, wins: 0, ties, accuracy: null, expected: null, excess: null, controlAccuracy: null, z: null, pValue: null, clusters: 0, effectiveN: null });
        continue;
      }
      const pu = upCand / dec, qf = upFwd / dec;
      let expected: number;
      if (direction === 'all') {
        expected = pu * qf + (1 - pu) * (1 - qf);
        bucketFwdUp.set(`${label}|${h}`, qf);
      } else {
        const qb = bucketFwdUp.get(`${label}|${h}`) ?? qf;
        expected = direction === 'buy' ? qb : 1 - qb;
      }
      const t = clusteredSignTest([...clusters.values()], expected, cfg.alpha);
      cells.push({
        bucket: label, direction, horizon: h, n: dec, wins, ties,
        accuracy: wins / dec, expected, excess: wins / dec - expected,
        controlAccuracy: cWins / dec,
        z: Number.isFinite(t.z) ? t.z : null,
        pValue: Number.isFinite(t.pValue) ? t.pValue : null,
        clusters: t.clusters,
        effectiveN: Number.isFinite(t.deff) ? Math.round(dec / t.deff) : null,
      });
    }
  };

  for (let b = 0; b < nb; b++) {
    const label = bucketLabel(edges[b], edges[b + 1]);
    evaluate(label, 'all', (c) => bucketOf(c.strength) === b);
    if (b >= topStart) {
      evaluate(label, 'buy', (c) => bucketOf(c.strength) === b && c.dir === 1);
      evaluate(label, 'sell', (c) => bucketOf(c.strength) === b && c.dir === -1);
    }
  }
  return { bars: n, candidates: cands.length, dojiSkipped: doji, cells };
}

/** Короткое автоматическое чтение верхних корзин: разворот / продолжение / нет эффекта. */
export function interpretTopBuckets(res: ContinuationResult, alpha = 0.05): 'reversal' | 'continuation' | 'none' {
  const all = res.cells.filter((c) => c.direction === 'all');
  const labels = [...new Set(all.map((c) => c.bucket))];
  const topLabels = new Set(labels.slice(-2)); // две верхние корзины (по умолчанию 95–99% и 99–100%)
  const cells = all.filter((c) => topLabels.has(c.bucket) && c.horizon <= 3 && c.pValue !== null && c.excess !== null);
  if (cells.length === 0) return 'none';
  const sig = cells.filter((c) => (c.pValue as number) < alpha && Math.abs(c.excess as number) >= 0.005);
  if (sig.length === 0) return 'none';
  const neg = sig.filter((c) => (c.excess as number) < 0).length;
  return neg > sig.length / 2 ? 'reversal' : 'continuation';
}
