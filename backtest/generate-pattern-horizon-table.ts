#!/usr/bin/env tsx
/**
 * Генератор runtime-таблицы горизонтов из JSON-отчётов horizon-audit.
 *
 * Читает `backtest/output/*.json` и генерирует
 * `src/decision/pattern-horizon-table.ts`.
 *
 * Что изменено относительно первой версии (ревизия слияния 2026-09-18) —
 * это правки корректности, не косметика:
 *
 *  1. ТАБЛИЦА СКОУПНУТА ПО КЛАССУ АКТИВА. Раньше все прогоны сливались в
 *     один плоский словарь по имени паттерна, и правило «valid бьёт
 *     не-valid» приводило к тому, что крипто-результат перебивал
 *     форекс-результат того же периода. Фактический пример из
 *     закоммиченных прогонов: harmonic-pattern 55.1% на BTCUSDT/ETHUSDT и
 *     44.0% (p=0.017 в проигрышную сторону) на EURUSD/USDJPY — в рантайм
 *     уходили крипто-30 баров на оба класса.
 *
 *  2. ТРИ СТАТУСА вместо двух:
 *       'valid'       — significant вверх + Wilson pass;
 *       'rejected'    — значимое отличие ВНИЗ (accuracy < baseline,
 *                       p <= alpha) — только это подавляет сигнал;
 *       'no-evidence' — всё остальное (отличие не установлено, либо
 *                       отличие вверх без Wilson pass).
 *     Раньше 'significant === false' («отличие не установлено») давало
 *     'rejected' и молча выключало стратегию. На закоммиченных данных это
 *     убило бы inside-bar (n=6166, p=0.87), strong-order-block-reaction
 *     (n=3439, p=0.95) и order-block-continuation (n=925, p=0.32).
 *
 *  3. КЛАССИФИКАЦИЯ СЧИТАЕТСЯ ИЗ pValue + testAccuracy, а не только из
 *     поля `significant`. Поле `significant` в уже сохранённых JSON
 *     получено прежней (багованной) версией holmBonferroni(), которая
 *     затирала направленное условие «accuracy > baseline» — из-за чего
 *     impulse-breakout с accuracy 46.3% помечен там `significant: true`.
 *     Сама функция исправлена в horizon-audit.ts, но переписывать старые
 *     отчёты задним числом нельзя, поэтому генератор их перепроверяет.
 *
 *  4. Асимметрия множественных сравнений — СОЗНАТЕЛЬНАЯ. Для допуска
 *     ('valid') используется Holm-скорректированный `significant` из
 *     отчёта; для защитного отказа ('rejected') — сырая alpha без
 *     поправки. Ложное срабатывание защиты стоит одного подавленного
 *     сигнала, ложный допуск стоит денег.
 *
 *  5. Детерминизм: файлы и ключи сортируются. Раньше порядок слияния
 *     зависел от порядка readdir(), т.е. от файловой системы.
 *
 *  6. setupType больше не теряется молча (см. mergeRecords).
 *     Фаза B'.3: для non-null setupType ключ в таблице —
 *     `patternName#setupType` (например `liquidity-sweep-reaction#continuation`);
 *     для null setupType — прежний плоский ключ `patternName`. Рантайм-лукап
 *     (recommended-expiry.ts::patternHorizonKey) использует ту же схему.
 *
 *  7. Пути не зависят от CWD; отсутствие/пустота output-каталога — не
 *     ошибка: генерируется ПУСТАЯ таблица (рантайм честно уходит в
 *     fallback), а не остаётся лежать прежняя, уже неактуальная.
 *
 *  8. СХЕМА 2 (auditSchemaVersion >= 2 в meta отчёта horizon-audit): вердикт
 *     берётся по ДЕДУПЛИЦИРОВАННЫМ наблюдениям и учитывает безубыточность при
 *     заданном payout (см. horizon-verdict.ts — ту же функцию применяет сам
 *     аудит; логика в одном месте). Прежние («legacy») отчёты без этого поля
 *     классифицируются по-старому по СЫРЫМ p-value — иначе закоммиченная
 *     таблица разошлась бы с генератором. Такие отчёты помечаются
 *     предупреждением: на них harmonic-pattern выглядит «valid» из-за
 *     перекрывающихся наблюдений (у него ~9 срабатываний на одно независимое).
 *     `--check` дополнительно падает, если у отчёта схемы 2 версия алгоритма
 *     (`algorithmVersion`) не совпадает с текущей OCCURRENCE_ALGORITHM_VERSION
 *     (отчёт посчитан старыми детекторами); `--strict` — падает и на legacy.
 *
 * Использование:
 *   npm run backtest:gen-horizon-table
 *   npm run backtest:gen-horizon-table -- --check            # CI: не писать, а сверить
 *   npm run backtest:gen-horizon-table -- --check --strict   # + считать legacy-отчёты ошибкой
 */
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyDeduped } from './horizon-verdict';
import { OCCURRENCE_ALGORITHM_VERSION } from './audit-version';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT_DIR = join(REPO_ROOT, 'backtest', 'output');
const TABLE_PATH = join(REPO_ROOT, 'src', 'decision', 'pattern-horizon-table.ts');

type AssetClass = 'crypto' | 'forex';
const ASSET_CLASSES: readonly AssetClass[] = ['crypto', 'forex'];

// Локальная копия признака «крипта», чтобы генератор не тянул весь граф
// импортов приложения (@/data/symbols → providers.config → ...). Согласие
// с src/data/symbols.ts::isCrypto закреплено тестом
// backtest/generate-pattern-horizon-table.test.ts.
const CRYPTO_QUOTE_SUFFIXES = ['USDT', 'USDC', 'BUSD'];

export function assetClassOfSymbol(symbolId: string): AssetClass {
  const upper = symbolId.toUpperCase();
  return CRYPTO_QUOTE_SUFFIXES.some((s) => upper.endsWith(s)) ? 'crypto' : 'forex';
}

export interface PatternResultJson {
  patternName: string;
  setupType: string | null;
  bestExpiryBars: number | null;
  testAccuracy: number | null;
  testCount: number | null;
  pValue: number | null;
  significant: boolean | null;
  passesWilsonGate: boolean | null;
  status: string;
  // Поля схемы 2 (см. horizon-verdict.ts). В legacy-отчётах отсутствуют.
  independentTestDecided?: number | null;
  testAccuracyDeduped?: number | null;
  pValueDeduped?: number | null;
  wilsonLowerBoundDeduped?: number | null;
  passesWilsonGateDeduped?: boolean | null;
  requiredWinRate?: number | null;
  significantDeduped?: boolean | null;
}

export interface AuditJson {
  meta: {
    symbols: string[];
    timeframe: string;
    from: string;
    to: string;
    split: string;
    alpha?: number;
    wilsonMargin?: number;
    /** >= 2 — вердикт по дедуплицированным наблюдениям; отсутствует — legacy. */
    auditSchemaVersion?: number;
    /** Версия алгоритма occurrences, которой посчитан отчёт (схема 2). */
    algorithmVersion?: number;
    generatedAt: string;
  };
  results: PatternResultJson[];
}

export type PatternHorizonStatus = 'valid' | 'rejected' | 'no-evidence';

export interface PatternHorizonEntry {
  expiryBars: number;
  accuracy: number;
  testCount: number;
  pValue: number | null;
  significant: boolean;
  passesWilsonGate: boolean;
  sourceRun: string;
}

export interface PatternHorizonRecord {
  entry: PatternHorizonEntry | null;
  status: PatternHorizonStatus;
  note?: string;
}

const DEFAULT_ALPHA = 0.05;
const BASELINE = 0.5;

export function classifyResult(
  r: PatternResultJson,
  sourceRun: string,
  alpha: number,
): PatternHorizonRecord | null {
  // 'insufficient-data' / 'no-detections' в таблицу не попадают вовсе:
  // отсутствие записи и 'no-evidence' на рантайме эквивалентны (fallback),
  // а пустые записи только раздували бы файл.
  if (r.status !== 'ok') return null;
  if (r.bestExpiryBars === null || r.testAccuracy === null) return null;

  const entry: PatternHorizonEntry = {
    expiryBars: r.bestExpiryBars,
    accuracy: Number(r.testAccuracy.toFixed(4)),
    testCount: r.testCount ?? 0,
    pValue: r.pValue === null ? null : Number(r.pValue.toPrecision(4)),
    significant: r.significant === true,
    passesWilsonGate: r.passesWilsonGate === true,
    sourceRun,
  };

  // Защитный отказ: значимое отличие ВНИЗ, сырая alpha без поправки.
  const adverse = r.pValue !== null && r.pValue <= alpha && r.testAccuracy < BASELINE;
  if (adverse) {
    return { entry, status: 'rejected', note: 'significant below baseline' };
  }

  // Допуск: направленная значимость (Holm-скорректированная) + Wilson.
  const significantUp = r.significant === true && r.testAccuracy > BASELINE;
  if (significantUp && r.passesWilsonGate === true) {
    return { entry, status: 'valid' };
  }
  if (significantUp) {
    return { entry, status: 'no-evidence', note: 'significant but Wilson gate not passed' };
  }
  return { entry, status: 'no-evidence', note: 'not distinguishable from baseline' };
}

/**
 * Классификация для отчётов схемы 2: по дедуплицированным наблюдениям и с
 * проверкой безубыточности (весь вердикт — в horizon-verdict.ts::
 * classifyDeduped, общий с самим аудитом). Пересчитывается из примитивов
 * JSON, а не берётся из сохранённого поля `verdict` — тот же принцип, что у
 * classifyResult (см. п.3 в шапке файла).
 *
 * Поля entry — дедуплицированные (accuracy/testCount/pValue/significant/
 * passesWilsonGate): именно на них принято решение. Если независимых
 * наблюдений меньше порога (pValueDeduped === null), entry строится по сырым
 * accuracy/testCount (нужен хотя бы expiryBars), но статус — 'no-evidence'.
 */
export function classifyResultDeduped(
  r: PatternResultJson,
  sourceRun: string,
  alpha: number,
  wilsonMargin: number,
): PatternHorizonRecord | null {
  if (r.status !== 'ok') return null;
  if (r.bestExpiryBars === null) return null;
  const accuracy = r.testAccuracyDeduped ?? r.testAccuracy;
  if (accuracy === null || accuracy === undefined) return null;

  const verdict = classifyDeduped({
    testAccuracyDeduped: r.testAccuracyDeduped ?? null,
    pValueDeduped: r.pValueDeduped ?? null,
    significantDeduped: r.significantDeduped ?? null,
    wilsonLowerBoundDeduped: r.wilsonLowerBoundDeduped ?? null,
    requiredWinRate: r.requiredWinRate ?? null,
    wilsonMargin,
    alpha,
  });

  const pD = r.pValueDeduped ?? null;
  const entry: PatternHorizonEntry = {
    expiryBars: r.bestExpiryBars,
    accuracy: Number(accuracy.toFixed(4)),
    testCount: r.independentTestDecided ?? r.testCount ?? 0,
    pValue: pD === null || !Number.isFinite(pD) ? null : Number(pD.toPrecision(4)),
    significant: r.significantDeduped === true,
    passesWilsonGate: r.passesWilsonGateDeduped === true,
    sourceRun,
  };
  return verdict.note ? { entry, status: verdict.status, note: verdict.note } : { entry, status: verdict.status };
}

const SEVERITY: Record<PatternHorizonStatus, number> = {
  rejected: 3,
  valid: 2,
  'no-evidence': 1,
};

/**
 * Консервативное слияние двух записей одного паттерна внутри одного
 * класса активов (разные прогоны или разные setupType одного паттерна —
 * рантайм-лукап знает только имя паттерна).
 *  - 'rejected' всегда побеждает: если хоть где-то паттерн значимо хуже
 *    случайного, допускать его по другому прогону нельзя.
 *  - два 'valid' с разным expiryBars — конфликт: деградируем до
 *    'no-evidence' и сообщаем. Выбирать горизонт произвольно из двух
 *    несогласованных прогонов нельзя.
 */
export function mergeRecords(
  a: PatternHorizonRecord,
  b: PatternHorizonRecord,
  onConflict: (msg: string) => void,
  label: string,
): PatternHorizonRecord {
  if (a.status === 'valid' && b.status === 'valid') {
    if (a.entry && b.entry && a.entry.expiryBars !== b.entry.expiryBars) {
      onConflict(
        `${label}: два valid-прогона дают разный горизонт (${a.entry.expiryBars} vs ${b.entry.expiryBars} bars) — деградировано до no-evidence`,
      );
      return { entry: a.entry, status: 'no-evidence', note: 'conflicting valid horizons across runs' };
    }
    return (b.entry?.testCount ?? 0) > (a.entry?.testCount ?? 0) ? b : a;
  }
  if (SEVERITY[b.status] > SEVERITY[a.status]) return b;
  if (SEVERITY[b.status] < SEVERITY[a.status]) return a;
  return (b.entry?.testCount ?? 0) > (a.entry?.testCount ?? 0) ? b : a;
}

/**
 * Ключ таблицы: для null setupType — `patternName`, для non-null —
 * `patternName#setupType`. Экспортируется для тестов и для согласования с
 * recommended-expiry.ts::patternHorizonKey.
 */
export function patternHorizonKey(patternName: string, setupType: string | null): string {
  return setupType ? `${patternName}#${setupType}` : patternName;
}

export type HorizonTable = Record<AssetClass, Record<string, PatternHorizonRecord>>;

export function buildTable(
  files: { name: string; data: AuditJson }[],
  warn: (msg: string) => void,
): HorizonTable {
  const table: HorizonTable = { crypto: {}, forex: {} };

  const ordered = [...files].sort((x, y) => (x.name < y.name ? -1 : x.name > y.name ? 1 : 0));

  for (const { name, data } of ordered) {
    const sourceRun = name.replace(/^horizon-audit-/, '').replace(/\.json$/, '');
    const symbols = data.meta?.symbols ?? [];
    if (symbols.length === 0) {
      warn(`${name}: meta.symbols пуст — файл пропущен`);
      continue;
    }
    const classes = new Set(symbols.map(assetClassOfSymbol));
    if (classes.size > 1) {
      warn(
        `${name}: пул смешивает классы активов (${symbols.join(', ')}) — файл пропущен, ` +
          'разложить такой отчёт обратно по классам невозможно',
      );
      continue;
    }
    const assetClass = [...classes][0];
    const alpha = typeof data.meta?.alpha === 'number' ? data.meta.alpha : DEFAULT_ALPHA;
    const wilsonMargin = typeof data.meta?.wilsonMargin === 'number' ? data.meta.wilsonMargin : 0;
    const dedupAware = (data.meta?.auditSchemaVersion ?? 0) >= 2;

    const results = [...(data.results ?? [])].sort((x, y) => {
      if (x.patternName !== y.patternName) return x.patternName < y.patternName ? -1 : 1;
      return String(x.setupType) < String(y.setupType) ? -1 : 1;
    });

    for (const r of results) {
      const record = dedupAware
        ? classifyResultDeduped(r, sourceRun, alpha, wilsonMargin)
        : classifyResult(r, sourceRun, alpha);
      if (!record) continue;
      const label = `${assetClass}/${r.patternName}${r.setupType ? `#${r.setupType}` : ''}`;
      const key = patternHorizonKey(r.patternName, r.setupType);
      const existing = table[assetClass][key];
      table[assetClass][key] = existing
        ? mergeRecords(existing, record, warn, label)
        : record;
    }
  }

  return table;
}

export type AuditFreshness = 'ok' | 'legacy' | 'stale';

/**
 * Актуальность отчёта horizon-audit относительно текущего кода.
 *  'legacy' — нет auditSchemaVersion >= 2: вердикт по сырым p-value, без
 *             дедупликации и проверки безубыточности;
 *  'stale'  — схема 2, но отчёт посчитан другой версией алгоритма
 *             occurrences (детекторы/набор индикаторов с тех пор менялись);
 *  'ok'     — иначе.
 */
export function auditFileFreshness(
  data: AuditJson,
  currentAlgorithmVersion: number = OCCURRENCE_ALGORITHM_VERSION,
): AuditFreshness {
  if ((data.meta?.auditSchemaVersion ?? 0) < 2) return 'legacy';
  return data.meta?.algorithmVersion === currentAlgorithmVersion ? 'ok' : 'stale';
}

function tsString(value: string): string {
  return JSON.stringify(value);
}

export function renderTable(table: HorizonTable, sourceRuns: string[]): string {
  const lines: string[] = [
    '// АВТОГЕНЕРИРОВАНО — не редактировать руками.',
    '// Генератор: backtest/generate-pattern-horizon-table.ts',
    '// Перегенерация: npm run backtest:gen-horizon-table',
    '// Сверка в CI:  npm run backtest:gen-horizon-table -- --check',
    '//',
    sourceRuns.length > 0
      ? `// Источники: ${sourceRuns.join(', ')}`
      : '// Источники: прогонов в backtest/output нет — таблица пуста, рантайм работает по fallback.',
    "import type { AssetClass } from '@/types/domain';",
    '',
    'export interface PatternHorizonEntry {',
    '  /** Лучший горизонт в барах, выбранный ТОЛЬКО по train/validation. */',
    '  expiryBars: number;',
    '  /** Точность на отложенных test-наблюдениях. */',
    '  accuracy: number;',
    '  testCount: number;',
    '  pValue: number | null;',
    '  significant: boolean;',
    '  passesWilsonGate: boolean;',
    '  sourceRun: string;',
    '}',
    '',
    '/**',
    " * 'valid'       — значимо лучше случайного + Wilson pass → берём expiryBars.",
    " * 'rejected'    — значимо ХУЖЕ случайного → signal-builder подавляет сигнал.",
    " * 'no-evidence' — отличие не установлено (или не прошло Wilson) → fallback,",
    ' *                 сигнал НЕ подавляется. Отсутствие записи эквивалентно.',
    ' */',
    "export type PatternHorizonStatus = 'valid' | 'rejected' | 'no-evidence';",
    '',
    'export interface PatternHorizonRecord {',
    '  entry: PatternHorizonEntry | null;',
    '  status: PatternHorizonStatus;',
    '  note?: string;',
    '}',
    '',
    'export type PatternHorizonTable = Record<AssetClass, Partial<Record<string, PatternHorizonRecord>>>;',
    '',
    'export const PATTERN_HORIZON_TABLE: PatternHorizonTable = {',
  ];

  for (const assetClass of ASSET_CLASSES) {
    const bucket = table[assetClass];
    const keys = Object.keys(bucket).sort();
    if (keys.length === 0) {
      lines.push(`  ${assetClass}: {},`);
      continue;
    }
    lines.push(`  ${assetClass}: {`);
    for (const key of keys) {
      const rec = bucket[key];
      lines.push(`    ${tsString(key)}: {`);
      if (rec.entry) {
        lines.push('      entry: {');
        lines.push(`        expiryBars: ${rec.entry.expiryBars},`);
        lines.push(`        accuracy: ${rec.entry.accuracy},`);
        lines.push(`        testCount: ${rec.entry.testCount},`);
        lines.push(`        pValue: ${rec.entry.pValue === null ? 'null' : rec.entry.pValue},`);
        lines.push(`        significant: ${rec.entry.significant},`);
        lines.push(`        passesWilsonGate: ${rec.entry.passesWilsonGate},`);
        lines.push(`        sourceRun: ${tsString(rec.entry.sourceRun)},`);
        lines.push('      },');
      } else {
        lines.push('      entry: null,');
      }
      lines.push(`      status: ${tsString(rec.status)},`);
      if (rec.note) lines.push(`      note: ${tsString(rec.note)},`);
      lines.push('    },');
    }
    lines.push('  },');
  }

  lines.push('};');
  return lines.join('\n') + '\n';
}

async function readOutputs(): Promise<{ name: string; data: AuditJson }[]> {
  let names: string[];
  try {
    names = await readdir(OUTPUT_DIR);
  } catch {
    return [];
  }
  const jsonFiles = names.filter((f) => f.endsWith('.json') && f.startsWith('horizon-audit-')).sort();
  const out: { name: string; data: AuditJson }[] = [];
  for (const name of jsonFiles) {
    const raw = await readFile(join(OUTPUT_DIR, name), 'utf-8');
    out.push({ name, data: JSON.parse(raw) as AuditJson });
  }
  return out;
}

async function main(): Promise<void> {
  const check = process.argv.includes('--check');
  const strict = process.argv.includes('--strict');
  const warnings: string[] = [];
  const warn = (m: string) => warnings.push(m);

  const files = await readOutputs();
  if (files.length === 0) {
    console.warn(
      `[gen-horizon-table] В ${OUTPUT_DIR} нет отчётов horizon-audit — будет сгенерирована ПУСТАЯ таблица. ` +
        'Это штатное поведение: лучше честный fallback, чем устаревшая калибровка.',
    );
  }

  const table = buildTable(files, warn);
  const content = renderTable(
    table,
    files.map((f) => f.name.replace(/^horizon-audit-/, '').replace(/\.json$/, '')),
  );

  for (const w of warnings) console.warn(`[gen-horizon-table] ВНИМАНИЕ: ${w}`);

  // Актуальность отчётов. legacy — предупреждение (иначе CI краснел бы на
  // закоммиченных отчётах, восстановленных из docx, которые не в чем
  // упрекнуть: они просто старее схемы); stale — ошибка только в --check.
  const legacy = files.filter((f) => auditFileFreshness(f.data) === 'legacy').map((f) => f.name);
  const stale = files.filter((f) => auditFileFreshness(f.data) === 'stale').map((f) => f.name);
  if (legacy.length > 0) {
    console.warn(
      `[gen-horizon-table] ВНИМАНИЕ: legacy-отчёты (нет auditSchemaVersion >= 2): ${legacy.join(', ')}. ` +
        'Статус valid в таблице для них выведен по СЫРЫМ p-value без дедупликации и без проверки безубыточности — ' +
        'перекрывающиеся срабатывания одного сетапа завышают значимость (у harmonic-pattern ~9× на одно независимое). ' +
        'Перезапустите npm run backtest:horizon-audit и перегенерируйте таблицу.',
    );
  }
  if (stale.length > 0) {
    console.warn(
      `[gen-horizon-table] ВНИМАНИЕ: отчёты посчитаны другой версией алгоритма (ожидается ${OCCURRENCE_ALGORITHM_VERSION}): ` +
        `${stale.join(', ')}. Перезапустите аудит.`,
    );
  }

  if (check) {
    if (stale.length > 0 || (strict && legacy.length > 0)) {
      console.error(
        '[gen-horizon-table] --check: ' +
          (stale.length > 0
            ? `отчёты устарели относительно кода (algorithmVersion != ${OCCURRENCE_ALGORITHM_VERSION}): ${stale.join(', ')}. `
            : '') +
          (strict && legacy.length > 0 ? `--strict: legacy-отчёты недопустимы: ${legacy.join(', ')}. ` : '') +
          'Перезапустите npm run backtest:horizon-audit, затем npm run backtest:gen-horizon-table.',
      );
      process.exit(1);
    }
    let current = '';
    try {
      current = await readFile(TABLE_PATH, 'utf-8');
    } catch {
      /* файла нет — считаем расхождением */
    }
    if (current !== content) {
      console.error(
        '[gen-horizon-table] --check: src/decision/pattern-horizon-table.ts НЕ соответствует ' +
          'backtest/output. Запустите npm run backtest:gen-horizon-table и закоммитьте результат.',
      );
      process.exit(1);
    }
    console.log('[gen-horizon-table] --check: таблица соответствует отчётам.');
    return;
  }

  await writeFile(TABLE_PATH, content, 'utf-8');
  const counts = ASSET_CLASSES.map((c) => `${c}=${Object.keys(table[c]).length}`).join(', ');
  console.log(`[gen-horizon-table] Записано ${TABLE_PATH} (${counts})`);
}

// main() запускается только при прямом вызове — модуль также импортируется
// юнит-тестом ради classifyResult/mergeRecords/buildTable/renderTable.
const invokedDirectly =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (invokedDirectly) {
  main().catch((err: unknown) => {
    console.error('[gen-horizon-table] Ошибка:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
