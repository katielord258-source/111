import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateRandomWalk } from './synthetic/random-walk';

// Сквозная проверка CLI-пути main(): без сети (загрузчик подменён детерминированным
// случайным блужданием), с выводом и occurrence-кэшем во ВРЕМЕННОМ каталоге.
// Кэш по умолчанию — относительный 'backtest/.cache'; occurrence-cache.test.ts
// стирает именно его, поэтому этот тест обязан работать в собственном cwd —
// иначе два тестовых процесса гонялись бы за один и тот же каталог.
vi.mock('./data-loader', () => ({
  loadHistory: ({ symbol }: { symbol: string }) =>
    Promise.resolve(generateRandomWalk({ bars: 7000, seed: symbol === 'BTCUSDT' ? 11 : 12, noiseFraction: 0.15 })),
}));

import { main } from './horizon-audit';
import {
  auditFileFreshness,
  buildTable,
  classifyResultDeduped,
  type AuditJson,
  type PatternResultJson,
} from './generate-pattern-horizon-table';

/** Строка результата: поля, которые читает генератор, + всё остальное как unknown. */
type ResultRow = PatternResultJson & { verdict?: string | null; [key: string]: unknown };
interface Report {
  meta: Record<string, unknown>;
  gateFunnel?: Record<string, number>;
  results: ResultRow[];
}
const asAudit = (r: Report): AuditJson => r as unknown as AuditJson;

const BASE = ['--symbols=BTCUSDT,ETHUSDT', '--from=2026-03-01', '--to=2026-03-15', '--timeframe=1m', '--min-samples=20'];

let workDir: string;
let originalCwd: string;
let originalArgv: string[];

async function run(extra: string[], outDir: string): Promise<{ json: Report; md: string; files: string[] }> {
  process.argv = ['node', 'horizon-audit.ts', ...BASE, `--output=${outDir}`, ...extra];
  await main();
  const files = readdirSync(outDir);
  const json = JSON.parse(readFileSync(join(outDir, files.find((f) => f.endsWith('.json'))!), 'utf8')) as Report;
  const md = readFileSync(join(outDir, files.find((f) => f.endsWith('.md'))!), 'utf8');
  return { json, md, files };
}

beforeAll(() => {
  originalCwd = process.cwd();
  originalArgv = process.argv;
  workDir = mkdtempSync(join(tmpdir(), 'horizon-e2e-'));
  process.chdir(workDir);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterAll(() => {
  process.argv = originalArgv;
  process.chdir(originalCwd);
  vi.restoreAllMocks();
  rmSync(workDir, { recursive: true, force: true });
});

describe('horizon-audit main(): сквозной прогон', () => {
  it('walk-forward: JSON схемы 2, вердикт согласован с генератором, воронка, отчёт', { timeout: 120000 }, async () => {
    const out = join(workDir, 'out-wf');
    const { json, md, files } = await run(['--split=walkforward', '--wf-folds=5', '--funnel', '--payout=80'], out);

    // Метаданные схемы 2
    expect(json.meta.auditSchemaVersion).toBe(2);
    expect(json.meta.payoutPercent).toBe(80);
    expect(json.meta.breakevenRate as number).toBeCloseTo(100 / 180, 10);
    expect(json.meta.dedupeScope).toBe('pool');
    expect(json.meta.indicators).toBe('live');
    expect(auditFileFreshness(asAudit(json))).toBe('ok');
    expect(files.some((f) => f.endsWith('.progress.json'))).toBe(false);

    // Каждая строка status=ok имеет вердикт и дедуп-поля; остальные — без вердикта
    const ok = json.results.filter((r) => r.status === 'ok');
    expect(ok.length).toBeGreaterThan(0);
    for (const r of json.results) {
      if (r.status === 'ok') {
        expect(r.verdict, `${r.patternName}: вердикт обязателен`).not.toBeNull();
        expect(r).toHaveProperty('requiredWinRate');
        expect(r).toHaveProperty('significantDeduped');
        // независимых исходов не больше сырых
        expect(r.independentTestDecided as number).toBeLessThanOrEqual(r.testDecidedCount as number);
      } else {
        expect(r.verdict ?? null).toBeNull();
      }
    }

    // Согласованность аудита и генератора: вердикт, записанный аудитом, равен
    // вердикту, который генератор пересчитывает из примитивов JSON.
    for (const r of ok) {
      const rec = classifyResultDeduped(r, 'run', json.meta.alpha as number, json.meta.wilsonMargin as number);
      expect(rec?.status, `${r.patternName}: расхождение аудит/генератор`).toBe(r.verdict);
    }
    // ... и таблица строится из этого отчёта без предупреждений
    const warnings: string[] = [];
    const table = buildTable([{ name: 'horizon-audit-x.json', data: asAudit(json) }], (m) => warnings.push(m));
    expect(warnings).toEqual([]);
    expect(Object.keys(table.crypto).length).toBeGreaterThan(0);

    // Воронка гейтов: в JSON и в отчёте
    expect(json.gateFunnel && Object.keys(json.gateFunnel).length).toBeGreaterThan(0);
    expect(json.gateFunnel!['hammer:00-evaluated']).toBeGreaterThan(0);
    expect(md).toContain('## Воронка гейтов');
    expect(md).toContain('Выплата (payout): 80%');
  });

  it('holdout + dedupe-scope=symbol + повторный прогон из occurrence-кэша', { timeout: 120000 }, async () => {
    const out = join(workDir, 'out-ho');
    const { json, md } = await run(['--split=holdout', '--dedupe-scope=symbol', '--payout=90'], out);
    expect(json.meta.dedupeScope).toBe('symbol');
    expect(json.meta.payoutPercent).toBe(90);
    expect(json.meta.breakevenRate as number).toBeCloseTo(100 / 190, 10);
    expect(json.gateFunnel).toBeUndefined(); // --funnel не задан
    expect(md).not.toContain('## Воронка гейтов');
    for (const r of json.results) {
      if (r.status === 'ok') expect(r.verdict).not.toBeNull();
    }
  });

  it.each([
    ['--payout=abc', /payout/],
    ['--payout=0', /payout/],
    ['--dedupe-scope=cluster', /dedupe-scope/],
    ['--indicators=some', /indicators/],
  ])('некорректный аргумент %s → явная ошибка, а не молчаливый дефолт', async (arg, msg) => {
    const err = vi.mocked(console.error);
    err.mockClear();
    process.argv = ['node', 'horizon-audit.ts', ...BASE, `--output=${join(workDir, 'out-bad')}`, arg];
    await expect(main()).rejects.toThrow(/process\.exit/);
    expect(err.mock.calls.flat().join(' ')).toMatch(msg);
  });
});
