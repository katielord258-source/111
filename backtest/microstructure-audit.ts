#!/usr/bin/env tsx
/**
 * Микроструктурная диагностика реальных данных: автокорреляция минутных
 * доходностей, доля «ничьих», VR(2) — см. microstructure.ts.
 *
 * Использование:
 *   npm run backtest:microstructure-audit -- --symbols=EURUSD,BTCUSDT --from=2026-03-01 --to=2026-09-17
 *
 * Пишет backtest/output/microstructure-audit-*.md (префикс НЕ «horizon-audit-»:
 * генератор таблицы горизонтов читает только horizon-audit-*.json).
 */
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { loadHistory } from './data-loader';
import { computeMicrostructureStats, interpretLag1 } from './microstructure';

const OUTPUT_DIR = join(resolve(dirname(fileURLToPath(import.meta.url)), '..'), 'backtest', 'output');

async function main(): Promise<void> {
  const map = new Map<string, string>();
  for (const a of process.argv.slice(2)) {
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) map.set(m[1], m[2]);
  }
  const symbols = (map.get('symbols') ?? 'EURUSD,BTCUSDT').split(',').map((s) => s.trim()).filter(Boolean);
  const from = map.get('from') ?? '2026-03-01';
  const to = map.get('to') ?? '2026-09-17';
  const fromMs = new Date(from).getTime();
  const toMs = new Date(to).getTime();
  if (Number.isNaN(fromMs) || Number.isNaN(toMs) || fromMs >= toMs) {
    console.error(`Invalid --from/--to (${from} → ${to}).`);
    process.exit(1);
  }
  if (symbols.length === 0) {
    console.error('--symbols is empty.');
    process.exit(1);
  }

  const lines: string[] = [
    `# Microstructure Audit — ${symbols.join(', ')} (1m)`,
    '',
    `> Сгенерировано: ${new Date().toISOString()}`,
    `> Период: ${from} → ${to}`,
    '',
    '| Инструмент | Свечей | Ничьи (close=prev) | ρ₁ | ρ₂ | ρ₃ | ρ₄ | ρ₅ | 1/√n | VR(2) | Вывод по ρ₁ |',
    '|---|---|---|---|---|---|---|---|---|---|---|',
  ];
  for (const symbol of symbols) {
    console.log(`Loading ${symbol}...`);
    const candles = await loadHistory({ symbol, fromMs, toMs });
    const st = computeMicrostructureStats(candles, 5);
    const reading = interpretLag1(st);
    const label = reading === 'mean-reverting' ? 'возвраты дребезжат (mean-reverting)' : reading === 'trending' ? 'инерция (trending)' : 'нет значимой автокорреляции';
    const rho = st.autocorr.map((x) => x.toFixed(4));
    lines.push(
      `| ${symbol} | ${st.bars} | ${(st.tieRate * 100).toFixed(2)}% | ${rho.join(' | ')} | ${st.autocorrStdErr.toFixed(4)} | ${st.varianceRatio2 !== null ? st.varianceRatio2.toFixed(3) : '—'} | ${label} |`,
    );
    console.log(`  ${symbol}: n=${st.returns}, ties=${(st.tieRate * 100).toFixed(2)}%, rho1=${rho[0]}, VR(2)=${st.varianceRatio2?.toFixed(3) ?? '—'} → ${label}`);
  }
  lines.push(
    '',
    'Интерпретация: значимо отрицательная ρ₁ (≈ −0.03…−0.1 и меньше) объясняет, почему паттерны продолжения движения на 1m проигрывают 50% (см. `npm run backtest:null-audit`). Это НЕ доказательство прибыльности обратной сделки: безубыточность бинарного контракта при выплате 80% — 55.56%, а часть «дребезга» — свойство котировки, а не рынка.',
  );

  await mkdir(OUTPUT_DIR, { recursive: true });
  const out = join(OUTPUT_DIR, `microstructure-audit-${symbols.join('-')}-1m-${from}-${to}.md`);
  await writeFile(out, lines.join('\n') + '\n', 'utf-8');
  console.log(`Report saved: ${out}`);
}

const isDirectRun = (() => {
  try {
    return process.argv[1] === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
})();

if (isDirectRun) {
  main()
    .then(() => process.exit(0))
    .catch((err: unknown) => {
      console.error('Microstructure audit failed:', err instanceof Error ? err.message : String(err));
      process.exit(1);
    });
}
