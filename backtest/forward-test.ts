#!/usr/bin/env tsx
/**
 * Форвард-тест «разворот после самой крупной свечи» (правила: backtest/forward-test-registry.ts,
 * протокол: docs/audit/FORWARD_TEST_REVERSAL_V1.md).
 *
 *   calibrate   npm run backtest:forward-test -- --mode=calibrate
 *               Считает пороги силы (99-й перцентиль тело/ATR на окне калибровки) и печатает их для registry.
 *   progress    npm run backtest:forward-test -- --mode=progress
 *               ТОЛЬКО число событий за форвард-период. Долей выигрыша не показывает (подглядывать нельзя).
 *   evaluate    npm run backtest:forward-test -- --mode=evaluate
 *               Единственный официальный вердикт. Отказывается работать, пока решённых событий < minEvents.
 *
 * необязательно: --rule=reversal-top1pct-v1  --to=ГГГГ-ММ-ДД (по умолчанию сегодня, UTC)
 */
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { loadHistory } from './data-loader';
import { FORWARD_TEST_RULES } from './forward-test-registry';
import { calibrateThreshold, extractForwardEvents, summarizeEvents, judge, validateRule, type ForwardEvent } from './forward-test-core';

const OUTPUT_DIR = join(resolve(dirname(fileURLToPath(import.meta.url)), '..'), 'backtest', 'output');
const DAY_MS = 86_400_000;

async function main(): Promise<void> {
  const map = new Map<string, string>();
  for (const a of process.argv.slice(2)) {
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) map.set(m[1], m[2]);
  }
  const mode = map.get('mode') ?? '';
  const rule = FORWARD_TEST_RULES[map.get('rule') ?? 'reversal-top1pct-v1'];
  if (!rule) { console.error('Unknown --rule.'); process.exit(1); }
  if (!['calibrate', 'progress', 'evaluate'].includes(mode)) { console.error('Use --mode=calibrate|progress|evaluate'); process.exit(1); }
  await mkdir(OUTPUT_DIR, { recursive: true });

  if (mode === 'calibrate') {
    const fromMs = new Date(rule.calibrationWindow.from).getTime();
    const toMs = new Date(rule.calibrationWindow.to).getTime();
    const result: Record<string, number> = {};
    for (const symbol of rule.instruments) {
      console.log(`Loading ${symbol} (${rule.calibrationWindow.from} → ${rule.calibrationWindow.to})...`);
      const candles = await loadHistory({ symbol, fromMs, toMs });
      const { threshold, candidates } = calibrateThreshold(candles, rule.atrPeriod, rule.strengthPercentile);
      console.log(`  ${symbol}: candles=${candles.length}, candidates=${candidates}, threshold(p${rule.strengthPercentile * 100}) = ${threshold}`);
      result[symbol] = threshold;
    }
    const snippet = `thresholds: { ${rule.instruments.map((s) => `${s}: ${result[s]}`).join(', ')} },`;
    console.log('\nВпишите в backtest/forward-test-registry.ts (правило ' + rule.id + ') и закоммитьте ДО ' + rule.forwardStartUtc + ':\n' + snippet);
    const out = join(OUTPUT_DIR, `forward-test-calibration-${rule.id}.json`);
    await writeFile(out, JSON.stringify({ rule: rule.id, calibrationWindow: rule.calibrationWindow, percentile: rule.strengthPercentile, thresholds: result, generatedAt: new Date().toISOString() }, null, 2) + '\n', 'utf-8');
    console.log(`Saved: ${out}`);
    return;
  }

  const errs = validateRule(rule);
  if (errs.length) { console.error('Регистрация неполна/некорректна:\n - ' + errs.join('\n - ')); process.exit(1); }
  const startMs = new Date(rule.forwardStartUtc).getTime();
  const to = map.get('to') ?? new Date().toISOString().slice(0, 10);
  const toMs = new Date(to).getTime() + DAY_MS; // включая указанный день
  if (Number.isNaN(toMs) || toMs <= startMs) {
    console.log(`Форвард-период ещё не начался или пуст (старт ${rule.forwardStartUtc}, --to=${to}). Событий: 0.`);
    return;
  }
  const events: ForwardEvent[] = [];
  for (const symbol of rule.instruments) {
    console.log(`Loading ${symbol}...`);
    // 2 часа до старта — только для прогрева ATR; события до forwardStartUtc отбрасываются в extractForwardEvents
    const candles = await loadHistory({ symbol, fromMs: startMs - 2 * 3_600_000, toMs });
    const ev = extractForwardEvents(symbol, candles, rule.thresholds[symbol] as number, rule);
    console.log(`  ${symbol}: событий ${ev.length} (порог ${rule.thresholds[symbol]})`);
    events.push(...ev);
  }
  const s = summarizeEvents(events, rule);

  if (mode === 'progress') {
    console.log(`\nПрогресс: решённых событий ${s.decided} из ${rule.minEvents} (${Math.round((100 * s.decided) / rule.minEvents)}%), ничьих ${s.ties}.`);
    console.log('Доли выигрыша намеренно не показываются: до набора выборки подглядывать нельзя.');
    return;
  }

  // evaluate
  const verdict = judge(s, rule);
  if (verdict === 'insufficient') {
    console.log(`\nВердикт НЕ выдаётся: решённых событий ${s.decided} < ${rule.minEvents}. Запустите позже (mode=progress покажет прогресс).`);
    return;
  }
  const pct = (x: number | null): string => (x === null ? '—' : (x * 100).toFixed(2) + '%');
  const lines = [
    `# Форвард-тест ${rule.id} — ОФИЦИАЛЬНЫЙ ВЕРДИКТ: ${verdict.toUpperCase()}`,
    '',
    `> Сгенерировано: ${new Date().toISOString()}; форвард-период: ${rule.forwardStartUtc} → ${to}`,
    `> Гипотеза: ${rule.hypothesis}`,
    '',
    `| Показатель | Значение |`, `|---|---|`,
    `| Решённых событий (пул) | ${s.decided} (ничьих ${s.ties}) |`,
    `| Доля выигрыша пула | ${pct(s.winRate)} |`,
    `| Кластеров (часовые блоки, все инструменты) | ${s.clusters} |`,
    `| Design effect / n_eff | ${s.designEffect.toFixed(2)} / ${s.effectiveN} |`,
    `| Wilson LB (n_eff) | ${pct(s.wilsonLB)} |`,
    `| Безубыток при выплате ${rule.payoutPercent}% | ${pct(s.breakeven)} |`,
    '',
    '| Инструмент (справочно, не влияет на вердикт) | Событий | Доля выигрыша |', '|---|---|---|',
    ...s.perSymbol.map((p) => `| ${p.symbol} | ${p.decided} | ${pct(p.winRate)} |`),
    '',
    verdict === 'pass'
      ? 'PASS: нижняя граница выше безубытка. Это допуск к следующему этапу (см. протокол), а не разрешение торговать.'
      : 'FAIL: преимущество выше безубытка не доказано. По протоколу гипотеза закрывается; продление выборки и смена порогов запрещены (новая гипотеза = новый id и новый форвард).',
  ];
  const out = join(OUTPUT_DIR, `forward-test-result-${rule.id}.md`);
  await writeFile(out, lines.join('\n') + '\n', 'utf-8');
  console.log(lines.join('\n'));
  console.log(`\nSaved: ${out}`);
}

const isDirectRun = (() => {
  try { return process.argv[1] === fileURLToPath(import.meta.url); } catch { return false; }
})();
if (isDirectRun) {
  main()
    .then(() => process.exit(0))
    .catch((err: unknown) => {
      console.error('Forward test failed:', err instanceof Error ? err.message : String(err));
      process.exit(1);
    });
}
