/**
 * Диагностическая «воронка» гейтов детекторов — ТОЛЬКО для аудита.
 *
 * Проблема, которую решает: отчёт horizon-audit говорит «недостаточно
 * данных» / «нет срабатываний» у десятков детекторов, но не говорит, ГДЕ
 * именно детектор отсеивает кандидатов (геометрия? контекст тренда? сессия?
 * RSI? подтверждение следующей свечой? порог confidence?). Без этого
 * «ослабить гейт» — гадание, а каждая правка порога на тех же данных —
 * подгонка (см. docs/audit/WALK_FORWARD_PROTOCOL.md).
 *
 * Как устроено. Детектор вызывает `gate('имя:NN-этап')` сразу ПОСЛЕ каждой
 * проверки, которую кандидат прошёл. Вне трассировки `sink === null`, и вызов
 * — одна проверка на null (нулевые побочные эффекты, поведение детекторов
 * не меняется). Внутри `beginGateTrace()/endGateTrace()` считается, сколько
 * баров дошло до каждого этапа: разница соседних счётчиков — число отсеянных
 * на этом гейте. Первый этап (`…:00-evaluated`) = сколько раз детектор
 * вообще вызывался.
 *
 * Сейчас инструментированы: hammer, inverted-hammer, hanging-man,
 * shooting-star (single.ts) и mean-reversion. Остальные детекторы в воронке
 * НЕ участвуют — добавляйте `gate()` по тому же образцу.
 */
let sink: Map<string, number> | null = null;

export function beginGateTrace(): void {
  sink = new Map();
}

/** Завершает трассировку и возвращает счётчики (пустую карту, если трассировка не начиналась). */
export function endGateTrace(): Map<string, number> {
  const result = sink ?? new Map<string, number>();
  sink = null;
  return result;
}

export function isGateTraceActive(): boolean {
  return sink !== null;
}

export function gate(name: string): void {
  if (sink !== null) sink.set(name, (sink.get(name) ?? 0) + 1);
}
