/**
 * Микроструктурная диагностика минутных свечей — чистые функции (без I/O).
 *
 * Зачем. В отчётах horizon-audit паттерны «продолжения движения»
 * (impulse-breakout, inside-bar, consolidation-breakout, …) стабильно
 * показывают точность НИЖЕ 50% на всех инструментах, а разворотные — чуть
 * выше. Один из механизмов, который это воспроизводит на чисто случайных
 * данных (см. null-audit.ts), — шум наблюдения (bid/ask-bounce, дискретность
 * котировок): он даёт ОТРИЦАТЕЛЬНУЮ автокорреляцию минутных доходностей.
 * Этот модуль измеряет на реальных данных, есть ли она на самом деле:
 * автокорреляция доходностей close→close на лагах 1..N, доля «ничьих»
 * (close == предыдущий close) и variance ratio VR(2).
 *
 * Важно: наличие отрицательной автокорреляции объясняет, почему
 * continuation-паттерны проигрывают 50%, но НЕ доказывает, что обратная
 * сделка прибыльна: часть этого эффекта — свойство котировки (её не
 * получить по рынку), а безубыточность бинарного контракта при выплате 80%
 * — 55.56%.
 */
import type { Candle } from '@/types/domain';

export interface MicrostructureStats {
  /** Число свечей. */
  bars: number;
  /** Число доходностей close→close (bars - 1 за вычетом нечисловых). */
  returns: number;
  /** Доля баров, где close == предыдущий close. */
  tieRate: number;
  /** Автокорреляция логарифмических доходностей на лагах 1..maxLag. */
  autocorr: number[];
  /** Приближённая стандартная ошибка автокорреляции при H0 (белый шум): 1/√n. */
  autocorrStdErr: number;
  /** Variance ratio VR(2) = Var(r₂)/(2·Var(r₁)); ≈ 1 + ρ₁. null — мало данных. */
  varianceRatio2: number | null;
}

export function computeMicrostructureStats(candles: readonly Candle[], maxLag = 5): MicrostructureStats {
  const closes = candles.map((c) => c.close);
  const r: number[] = [];
  let ties = 0;
  for (let i = 1; i < closes.length; i++) {
    const prev = closes[i - 1];
    const cur = closes[i];
    if (!(prev > 0) || !(cur > 0) || !Number.isFinite(prev) || !Number.isFinite(cur)) continue;
    if (cur === prev) ties++;
    r.push(Math.log(cur / prev));
  }
  const n = r.length;
  const empty: MicrostructureStats = {
    bars: candles.length,
    returns: n,
    tieRate: n > 0 ? ties / n : 0,
    autocorr: Array.from({ length: maxLag }, () => 0),
    autocorrStdErr: n > 0 ? 1 / Math.sqrt(n) : 0,
    varianceRatio2: null,
  };
  if (n < maxLag + 10) return empty;

  const mean = r.reduce((s, x) => s + x, 0) / n;
  let denom = 0;
  for (const x of r) denom += (x - mean) * (x - mean);
  if (denom === 0) return empty;

  const autocorr: number[] = [];
  for (let k = 1; k <= maxLag; k++) {
    let num = 0;
    for (let i = k; i < n; i++) num += (r[i] - mean) * (r[i - k] - mean);
    autocorr.push(num / denom);
  }

  // VR(2) на перекрывающихся двухбарных доходностях.
  const var1 = denom / (n - 1);
  const r2: number[] = [];
  for (let i = 1; i < n; i++) r2.push(r[i] + r[i - 1]);
  const mean2 = r2.reduce((s, x) => s + x, 0) / r2.length;
  let s2 = 0;
  for (const x of r2) s2 += (x - mean2) * (x - mean2);
  const var2 = s2 / (r2.length - 1);

  return {
    bars: candles.length,
    returns: n,
    tieRate: ties / n,
    autocorr,
    autocorrStdErr: 1 / Math.sqrt(n),
    varianceRatio2: var1 > 0 ? var2 / (2 * var1) : null,
  };
}

export type MicrostructureReading = 'mean-reverting' | 'trending' | 'none';

/**
 * Грубая интерпретация lag-1 автокорреляции: значимо отрицательная (< −z·SE)
 * — возвраты «дребезжат» (mean-reverting на 1 бар), значимо положительная —
 * инерция. z=3 по умолчанию: при сотнях тысяч баров даже ничтожная
 * автокорреляция «значима» при z=2, поэтому смотрим ещё и на величину.
 */
export function interpretLag1(stats: MicrostructureStats, z = 3, minAbs = 0.01): MicrostructureReading {
  const rho = stats.autocorr[0];
  if (rho === undefined) return 'none';
  if (Math.abs(rho) < minAbs || Math.abs(rho) < z * stats.autocorrStdErr) return 'none';
  return rho < 0 ? 'mean-reverting' : 'trending';
}
