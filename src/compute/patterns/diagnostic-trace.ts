/**
 * D3 (промт "Исправление по воронке гейтов", п.6 "Потолок confidence" и
 * п.7 "Mean-reversion (0 срабатываний)"): точечные диагностические счётчики
 * "сначала измерение, а не правка" — намеренно ОТДЕЛЬНЫЕ от основной
 * воронки гейтов (gate-trace.ts).
 *
 * Почему отдельный sink, а не переиспользование gate()/gateFunnel: у обоих
 * разрезов ниже монотонность относительно соседних стадий gate-trace.ts не
 * сохраняется по построению — например, «band-exit без требования по RSI»
 * по определению встречается не реже, чем «band-exit И RSI в зоне»
 * (mean-reversion:05-band-exit-rsi). Строгий монотонный тест воронки
 * (backtest/gate-trace.test.ts, «Воронка монотонно не возрастает по этапам
 * каждого детектора») сортирует стадии одного детектора лексикографически и
 * требует count[i] <= count[i-1] по всей цепочке — подмешивание такого
 * счётчика в тот же sink сломало бы этот тест не из-за бага, а из-за самой
 * природы разреза. Поэтому — независимый канал, с тем же принципом нулевого
 * побочного эффекта вне трассировки (один `if (sink !== null)` на вызов).
 *
 * Детекторы вызывают diagCount() ДОПОЛНИТЕЛЬНО к существующим gate() —
 * ни один вызов gate() не удалён и не переставлен, поведение и
 * gateFunnel в отчёте не меняются.
 */
let sink: Map<string, number> | null = null;

export function beginDiagnosticTrace(): void {
  sink = new Map();
}

/** Завершает трассировку и возвращает счётчики (пустую карту, если трассировка не начиналась). */
export function endDiagnosticTrace(): Map<string, number> {
  const result = sink ?? new Map<string, number>();
  sink = null;
  return result;
}

export function isDiagnosticTraceActive(): boolean {
  return sink !== null;
}

export function diagCount(name: string): void {
  if (sink !== null) sink.set(name, (sink.get(name) ?? 0) + 1);
}

/**
 * D3, п.6: классификация множителя htfAlignment()/htfAlignmentStrict() по
 * тем же четырём значениям, что в ручной таблице потолков промта —
 * 1.0 (BOS по тренду) / 0.75 (CHoCH) / 0.5 (дефолт) / 0.4 (HTF в диапазоне).
 * Диапазоны допусков — на случай использования htfAlignmentStrict (0.90/0.70/0.45).
 */
export function htfClassOf(multiplier: number): '1.00-bos' | '0.75-choch' | '0.40-range' | 'other' {
  if (multiplier >= 0.95) return '1.00-bos';
  if (multiplier >= 0.65 && multiplier <= 0.95) return '0.75-choch';
  if (multiplier <= 0.45) return '0.40-range';
  return 'other';
}

/** Простой markdown-рендер для diagnosticFunnel — без претензии на формат formatGateFunnel. */
export function formatDiagnosticFunnel(counts: Record<string, number>): string[] {
  const entries = Object.entries(counts);
  if (entries.length === 0) return [];
  const lines: string[] = [
    '## D3 — диагностические срезы (не влияют на вердикты, только измерение)',
    '',
    '| Счётчик | Значение |',
    '|---|---|',
  ];
  for (const [k, v] of entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    lines.push(`| ${k} | ${v} |`);
  }
  return lines;
}
