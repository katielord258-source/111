/**
 * Partitioning logic for horizon-audit — extracted so it can be
 * unit-tested without running the full CLI (which needs network
 * access and heavy computation).
 *
 * BUGFIX (слияние 2026-09-17): предыдущая версия `assignWalkForwardPartitions`
 * не была настоящим walk-forward — она делила КАЖДЫЙ fold локально на
 * "первые purgeSeconds = train" / "остальное = test", не используя
 * предыдущие folds как обучающую выборку для последующих. При purge=0 это
 * давало ВСЕ наблюдения как test и НИ ОДНОГО train — отбор bestExpiryBars
 * был бы невозможен на большинстве folds. Заменено на настоящую схему:
 * folds — это хронологические бакеты, и для каждого fold k (кроме fold 0,
 * у которого нет истории) train = все occurrences из folds < k (с purge-
 * отступом перед границей), test = occurrences fold k. Отбор/оценку по
 * фолдам делает horizon-audit.ts (computeWalkForwardResult) — этот модуль
 * отвечает только за то, к какому fold относится каждое наблюдение по
 * времени.
 */

export interface Partitionable {
  time: number;
  partition: 'train' | 'validation' | 'test';
  fold: number;
}

export interface FoldBoundary {
  /** Индекс fold (0-based). */
  index: number;
  /** Начало окна fold (включительно), unix-секунды. */
  start: number;
  /** Конец окна fold (исключающая верхняя граница), unix-секунды. */
  end: number;
}

/**
 * Holdout partitioning by global timestamp across all pooled symbols.
 * Uses min/max timestamps across ALL occurrences to define
 * chronological boundaries, so symbols with different date ranges
 * are split consistently by wall-clock time. НЕ изменялось при
 * слиянии 2026-09-17 — уже корректно, покрыто тестами.
 */
export function assignHoldoutPartitions<T extends Partitionable>(occurrences: T[]): void {
  if (occurrences.length === 0) return;
  let minTime = Infinity;
  let maxTime = -Infinity;
  for (const o of occurrences) {
    if (o.time < minTime) minTime = o.time;
    if (o.time > maxTime) maxTime = o.time;
  }
  const span = maxTime - minTime;
  if (span <= 0) return;
  const trainEnd = minTime + span * 0.6;
  const valEnd = minTime + span * 0.8;
  for (const o of occurrences) {
    if (o.time < trainEnd) o.partition = 'train';
    else if (o.time < valEnd) o.partition = 'validation';
    else o.partition = 'test';
  }
}

/**
 * Делит весь пул наблюдений на `folds` равных по длительности
 * хронологических окон (по глобальному диапазону времени, не по
 * количеству наблюдений — окна могут содержать разное число occurrences,
 * если плотность срабатываний паттернов неравномерна во времени).
 *
 * Возвращает границы окон; сами occurrences не модифицирует — см.
 * assignFoldIndex().
 */
export function computeFoldBoundaries(
  minTime: number,
  maxTime: number,
  folds: number,
): FoldBoundary[] {
  const span = maxTime - minTime;
  const boundaries: FoldBoundary[] = [];
  if (span <= 0 || folds <= 0) return boundaries;
  const foldSize = span / folds;
  for (let i = 0; i < folds; i++) {
    const start = minTime + i * foldSize;
    // Последний fold включает maxTime включительно (иначе наблюдение
    // ровно в maxTime не попадёт ни в один fold из-за строгого <).
    const end = i === folds - 1 ? maxTime + 1 : minTime + (i + 1) * foldSize;
    boundaries.push({ index: i, start, end });
  }
  return boundaries;
}

/** Присваивает `o.fold` по границам, вычисленным computeFoldBoundaries(). */
export function assignFoldIndex<T extends { time: number; fold: number }>(
  occurrences: T[],
  boundaries: FoldBoundary[],
): void {
  for (const o of occurrences) {
    for (const b of boundaries) {
      if (o.time >= b.start && o.time < b.end) {
        o.fold = b.index;
        break;
      }
    }
  }
}

export {
  /**
   * Re-exported from the shared module for convenience in backtest code.
   */
  wilsonLowerBound,
} from '@/lib/wilson';
