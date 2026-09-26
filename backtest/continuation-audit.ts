#!/usr/bin/env tsx
/**
 * Условное продолжение/разворот после крупной свечи на реальных данных (см. continuation.ts).
 *
 *   npm run backtest:continuation-audit -- --symbols=EURUSD,USDJPY,BTCUSDT,ETHUSDT --from=2026-03-01 --to=2026-09-17
 *   необязательно: --horizons=1,2,3,5,10  --seed=1  --payout=80
 *
 * Пишет backtest/output/continuation-audit-*.md (префикс НЕ «horizon-audit-»: генератор таблицы его не читает).
 */
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { loadHistory } from './data-loader';
import { wilsonLowerBound } from '@/lib/wilson';
import {
  computeContinuationStats,
  interpretTopBuckets,
  DEFAULT_CONTINUATION_CONFIG,
  type ContinuationResult,
} from './continuation';

const OUTPUT_DIR = join(resolve(dirname(fileURLToPath(import.meta.url)), '..'), 'backtest', 'output');

function fmtCell(excess: number | null, p: number | null): string {
  if (excess === null) return '—';
  const pp = (excess * 100).toFixed(1);
  const sign = excess > 0 ? '+' : '';
  return p === null ? `${sign}${pp}` : `${sign}${pp} (p=${p < 0.001 ? '<0.001' : p.toFixed(3)})`;
}

/** Разворотная сделка (против свечи): выигрыш = n − wins. Сравнение с безубытком — по Wilson LB от эффективного n. */
export function renderReversalTable(res: ContinuationResult, horizons: number[], payoutPercent: number, title: string): string[] {
  const out: string[] = [];
  const be = 100 / (100 + payoutPercent);
  out.push('', `### ${title} (безубыток при выплате ${payoutPercent}% = ${(be * 100).toFixed(2)}%)`, '',
    '| Корзина | h | n | Доля выигрыша разворота | n_eff | Wilson LB (n_eff) | Выше безубытка? |', '|---|---|---|---|---|---|---|');
  const allLabels = [...new Set(res.cells.filter((c) => c.direction === 'all').map((c) => c.bucket))];
  for (const b of allLabels.slice(-2)) {
    for (const h of horizons) {
      const c = res.cells.find((x) => x.bucket === b && x.direction === 'all' && x.horizon === h);
      if (!c || c.n === 0 || c.accuracy === null) continue;
      const rev = 1 - c.accuracy;
      const nEff = c.effectiveN ?? c.n;
      const lb = wilsonLowerBound(rev * nEff, nEff);
      out.push(`| ${b} | ${h} | ${c.n} | ${(rev * 100).toFixed(1)}% | ${nEff} | ${(lb * 100).toFixed(1)}% | ${lb > be ? '**да**' : 'нет'} |`);
    }
  }
  return out;
}

export function renderSymbolSection(symbol: string, res: ContinuationResult, horizons: number[], payoutPercent = 80, resNextOpen?: ContinuationResult): string[] {
  const out: string[] = [];
  const reading = interpretTopBuckets(res);
  const label = reading === 'reversal' ? 'после крупных свечей — РАЗВОРОТ (значимо)'
    : reading === 'continuation' ? 'после крупных свечей — ПРОДОЛЖЕНИЕ (значимо)' : 'значимого эффекта в верхней корзине нет';
  out.push(`## ${symbol}`, '', `Свечей: ${res.bars}, кандидатов: ${res.candidates}, доджи пропущено: ${res.dojiSkipped}. **Вывод (лаги ≤3, верхняя корзина): ${label}.**`, '');
  out.push(`| Корзина силы (тело/ATR) | Напр. | n (h=${horizons[0]}) | ${horizons.map((h) => `excess h=${h}, п.п.`).join(' | ')} |`);
  out.push(`|---|---|---|${horizons.map(() => '---').join('|')}|`);
  const keys: Array<[string, string]> = [];
  for (const c of res.cells) {
    const k = `${c.bucket}|${c.direction}`;
    if (!keys.some((x) => `${x[0]}|${x[1]}` === k)) keys.push([c.bucket, c.direction]);
  }
  let maxCtrlZ = 0;
  for (const [bucket, dir] of keys) {
    const row = horizons.map((h) => res.cells.find((c) => c.bucket === bucket && c.direction === dir && c.horizon === h));
    const n = row[0]?.n ?? 0;
    out.push(`| ${bucket} | ${dir === 'all' ? 'все' : dir === 'buy' ? 'вверх' : 'вниз'} | ${n} | ${row.map((c) => (c ? fmtCell(c.excess, c.pValue) : '—')).join(' | ')} |`);
    // отклонение контроля в «сигмах» биномиального шума при n независимых испытаний: |acc−0.5|·2·√n
    for (const c of row) if (c && c.controlAccuracy !== null && c.n >= 200) maxCtrlZ = Math.max(maxCtrlZ, Math.abs(c.controlAccuracy - 0.5) * 2 * Math.sqrt(c.n));
  }
  out.push(...renderReversalTable(res, horizons, payoutPercent, 'Если торговать ПРОТИВ свечи — вход по close сигнальной свечи (как в horizon-audit)'));
  if (resNextOpen) {
    out.push(...renderReversalTable(resNextOpen, horizons, payoutPercent, 'То же, но вход по OPEN следующего бара (реалистичнее: первый тик после закрытия свечи)'));
  }
  out.push('', `Контроль случайного знака (ячейки с n≥200): максимальное отклонение точности от 50% = ${maxCtrlZ.toFixed(1)}σ биномиального шума (по ${keys.length * horizons.length} ячейкам ожидаемый максимум ≈ 3σ; кластеры перекрываются, поэтому порог тревоги 4σ). ${maxCtrlZ > 4 ? '**⚠ велико — в измерении может быть артефакт**' : '(норма)'}`, '');
  return out;
}

async function main(): Promise<void> {
  const map = new Map<string, string>();
  for (const a of process.argv.slice(2)) {
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) map.set(m[1], m[2]);
  }
  const symbols = (map.get('symbols') ?? 'EURUSD,USDJPY,BTCUSDT,ETHUSDT').split(',').map((s) => s.trim()).filter(Boolean);
  const from = map.get('from') ?? '2026-03-01';
  const to = map.get('to') ?? '2026-09-17';
  const horizons = (map.get('horizons') ?? '1,2,3,5,10').split(',').map((s) => parseInt(s, 10)).filter((n) => n > 0);
  const seed = parseInt(map.get('seed') ?? '1', 10);
  const payout = parseFloat(map.get('payout') ?? '80');
  const fromMs = new Date(from).getTime();
  const toMs = new Date(to).getTime();
  if (Number.isNaN(fromMs) || Number.isNaN(toMs) || fromMs >= toMs || symbols.length === 0 || horizons.length === 0) {
    console.error('Invalid arguments (--symbols / --from / --to / --horizons).');
    process.exit(1);
  }
  const cfg = { ...DEFAULT_CONTINUATION_CONFIG, horizons, seed };

  const lines: string[] = [
    `# Continuation Audit — ${symbols.join(', ')} (1m)`,
    '',
    `> Сгенерировано: ${new Date().toISOString()}`,
    `> Период: ${from} → ${to}; горизонты (бары): ${horizons.join(', ')}; seed контроля: ${seed}`,
    '',
    'excess = точность «направление свечи → направление через h баров» минус точность, ожидаемая при НЕЗАВИСИМОСТИ (с теми же долями вверх/вниз). Отрицательный — разворот после свечи, положительный — продолжение. p — кластерно-устойчивый тест (временные блоки ≥60 мин).',
    'Это диагностика, не торговая стратегия: безубыточность при выплате 80% — 55.56%, а часть эффекта на 1m — свойство котировки.',
    '',
  ];
  for (const symbol of symbols) {
    console.log(`Loading ${symbol}...`);
    const { candles, truncatedByIterationCap } = await loadHistory({ symbol, fromMs, toMs });
    if (truncatedByIterationCap) console.warn(`  ${symbol}: WARNING — history truncated by iteration cap`);
    const res = computeContinuationStats(candles, { ...cfg, entry: 'close' });
    const resNext = computeContinuationStats(candles, { ...cfg, entry: 'next-open' });
    lines.push(...renderSymbolSection(symbol, res, horizons, payout, resNext));
    // Устойчивость во времени: те же корзины на первой и второй половине периода (границы корзин пересчитываются на каждой половине).
    const mid = Math.floor(candles.length / 2);
    const halves: Array<[string, typeof candles]> = [['1-я половина', candles.slice(0, mid)], ['2-я половина', candles.slice(mid)]];
    lines.push('### Устойчивость во времени (верхняя корзина, все направления)', '', '| Половина периода | Корзина | h | n | excess, п.п. | p | Доля выигрыша разворота |', '|---|---|---|---|---|---|---|');
    for (const [name, part] of halves) {
      const r = computeContinuationStats(part, cfg);
      const labels = [...new Set(r.cells.filter((c) => c.direction === 'all').map((c) => c.bucket))];
      const b = labels[labels.length - 1];
      for (const h of horizons.filter((x) => x === 1 || x === 3)) {
        const c = r.cells.find((x) => x.bucket === b && x.direction === 'all' && x.horizon === h);
        if (!c || c.accuracy === null || c.excess === null) continue;
        lines.push(`| ${name} | ${b} | ${h} | ${c.n} | ${(c.excess * 100).toFixed(1)} | ${c.pValue === null ? '—' : c.pValue < 0.001 ? '<0.001' : c.pValue.toFixed(3)} | ${((1 - c.accuracy) * 100).toFixed(1)}% |`);
      }
    }
    lines.push('');
    const top = res.cells.filter((c) => c.direction === 'all').slice(-horizons.length);
    console.log(`  ${symbol}: candidates=${res.candidates}; top bucket excess = ${top.map((c) => `h${c.horizon}:${c.excess === null ? '—' : (c.excess * 100).toFixed(1)}`).join(' ')}`);
  }
  await mkdir(OUTPUT_DIR, { recursive: true });
  const out = join(OUTPUT_DIR, `continuation-audit-${symbols.join('-')}-1m-${from}-${to}.md`);
  await writeFile(out, lines.join('\n') + '\n', 'utf-8');
  console.log(`Report saved: ${out}`);
}

const isDirectRun = (() => {
  try { return process.argv[1] === fileURLToPath(import.meta.url); } catch { return false; }
})();
if (isDirectRun) {
  main()
    .then(() => process.exit(0))
    .catch((err: unknown) => {
      console.error('Continuation audit failed:', err instanceof Error ? err.message : String(err));
      process.exit(1);
    });
}
