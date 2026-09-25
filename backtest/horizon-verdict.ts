/**
 * Чистые (без импортов и I/O) функции вердикта horizon-audit.
 *
 * Зачем отдельный модуль: одну и ту же логику обязаны применять и сам аудит
 * (horizon-audit.ts), и генератор runtime-таблицы
 * (generate-pattern-horizon-table.ts). Если держать её в двух местах, они
 * неизбежно разъедутся — ровно тот класс ошибки, который проект уже ловил
 * (см. docs/audit/WALK_FORWARD_PROTOCOL.md, «дублирование экономической
 * логики»).
 *
 * Что меняется относительно прежней схемы (auditSchemaVersion < 2):
 *  1. Значимость, Wilson-граница и Holm считаются по ДЕДУПЛИЦИРОВАННЫМ
 *     наблюдениям. Прежний биномиальный тест считал независимыми до ~30
 *     подряд идущих срабатываний одного сетапа при перекрывающихся
 *     горизонтах (у harmonic-pattern — примерно 9-кратное завышение n).
 *  2. Допуск ('valid') требует не «лучше 50%», а «нижняя граница Уилсона
 *     выше требуемой доли выигрышей» = max(безубыточность при payout,
 *     дрейф-baseline). При выплате 80% безубыточность 55.56%, а не 50%.
 */

export type HorizonVerdict = 'valid' | 'rejected' | 'no-evidence';

/** Случайное направление должно давать именно 50% — нулевая гипотеза теста. */
export const RANDOM_BASELINE = 0.5;

export interface DedupedVerdictInput {
  /** Точность на независимых test-наблюдениях (null — их меньше порога). */
  testAccuracyDeduped: number | null;
  /** Двусторонний точный p-value против 0.5 на независимых наблюдениях. */
  pValueDeduped: number | null;
  /** Holm-скорректированная значимость ВВЕРХ на дедуплицированном семействе. */
  significantDeduped: boolean | null;
  /** Нижняя граница Уилсона (95%) на независимых наблюдениях. */
  wilsonLowerBoundDeduped: number | null;
  /**
   * Требуемая доля выигрышей: max(безубыточность при payout, дрейф-baseline).
   * null — не задана (тогда нижняя планка — только 0.5 + wilsonMargin).
   */
  requiredWinRate: number | null;
  /** Запас над 0.5 для Wilson-гейта (CLI --wilson-margin). */
  wilsonMargin: number;
  /** Порог значимости для защитного отказа (сырая alpha, без поправки). */
  alpha: number;
}

export interface VerdictResult {
  status: HorizonVerdict;
  note: string;
}

/**
 * Вердикт по дедуплицированным наблюдениям.
 *
 * Асимметрия множественных сравнений — СОЗНАТЕЛЬНАЯ и унаследована от
 * прежней схемы: допуск ('valid') требует Holm-скорректированной значимости,
 * защитный отказ ('rejected') — сырой alpha. Ложный отказ стоит одного
 * подавленного сигнала, ложный допуск стоит денег.
 */
export function classifyDeduped(i: DedupedVerdictInput): VerdictResult {
  if (i.testAccuracyDeduped === null || i.pValueDeduped === null || !Number.isFinite(i.pValueDeduped)) {
    return { status: 'no-evidence', note: 'fewer independent observations than the significance threshold' };
  }

  if (i.pValueDeduped <= i.alpha && i.testAccuracyDeduped < RANDOM_BASELINE) {
    return { status: 'rejected', note: 'significant below baseline (deduplicated)' };
  }

  const significantUp = i.significantDeduped === true && i.testAccuracyDeduped > RANDOM_BASELINE;
  if (!significantUp) {
    return { status: 'no-evidence', note: 'not distinguishable from baseline (deduplicated)' };
  }

  const lb = i.wilsonLowerBoundDeduped;
  if (lb === null || lb < RANDOM_BASELINE + i.wilsonMargin) {
    return { status: 'no-evidence', note: 'significant but Wilson gate not passed (deduplicated)' };
  }
  if (i.requiredWinRate !== null && !(lb > i.requiredWinRate)) {
    return { status: 'no-evidence', note: 'significant but Wilson lower bound not above breakeven' };
  }
  return { status: 'valid', note: '' };
}

/**
 * Процедура Холма (step-down) над списком p-value. Возвращает для каждой
 * позиции: отвергнута ли H0 после поправки И направление «вверх»
 * (accuracy > baseline). Позиции с p === null / NaN в семейство не входят
 * (результат для них — null).
 *
 * Логика идентична прежнему holmBonferroni() из horizon-audit.ts
 * (ревизия 2026-09-18: step-down + направленное условие), вынесена в чистую
 * функцию, чтобы применять её и к сырым, и к дедуплицированным p-value.
 */
export function holmStepDown(
  items: readonly { pValue: number | null; accuracy: number | null }[],
  alpha: number,
  baseline: number = RANDOM_BASELINE,
): (boolean | null)[] {
  const out: (boolean | null)[] = items.map(() => null);
  const idx: number[] = [];
  items.forEach((it, k) => {
    if (it.pValue !== null && Number.isFinite(it.pValue)) idx.push(k);
  });
  idx.sort((a, b) => items[a].pValue! - items[b].pValue!);
  const m = idx.length;
  let stopped = false;
  for (let rank = 0; rank < m; rank++) {
    const k = idx[rank];
    const threshold = alpha / (m - rank);
    const rejectedH0 = !stopped && items[k].pValue! <= threshold;
    if (!rejectedH0) stopped = true;
    const acc = items[k].accuracy;
    out[k] = rejectedH0 && acc !== null && acc > baseline;
  }
  return out;
}

/**
 * Ожидаемая точность «случайного направления» с тем же соотношением
 * buy/sell и на тех же барах: доля buy × P(цена выросла) + доля sell ×
 * P(цена упала). Контролирует дрейф рынка за период (восходящий тренд
 * сам по себе даёт buy-сигналам >50%, даже если паттерн ничего не знает).
 *
 * decided — число решённых (не ничьих) исходов, rises — сколько из них
 * закончились ростом цены (вне зависимости от направления сигнала), buys —
 * сколько из них были buy-сигналами. Возвращает null при decided <= 0.
 */
export function driftBaselineFromCounts(decided: number, rises: number, buys: number): number | null {
  if (!(decided > 0)) return null;
  const pUp = rises / decided;
  const fBuy = buys / decided;
  return fBuy * pUp + (1 - fBuy) * (1 - pUp);
}

/** Требуемая доля выигрышей: не ниже безубыточности и не ниже дрейф-baseline. */
export function requiredWinRateFor(breakevenRate: number, driftBaseline: number | null): number {
  return driftBaseline === null ? breakevenRate : Math.max(breakevenRate, driftBaseline);
}
