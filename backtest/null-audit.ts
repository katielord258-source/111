#!/usr/bin/env tsx
/**
 * Нулевой (плацебо) аудит: прогоняет ТОТ ЖЕ конвейер horizon-audit
 * (detectAllPatterns → исходы → walk-forward → дедупликация → Holm →
 * вердикт) на синтетическом случайном блуждании, где предсказуемости нет
 * по построению.
 *
 * Что проверяет:
 *  1. Конвейер не смещён: на чистом блуждании точность паттернов ≈ 50%.
 *  2. Вердикт `valid` не выдаётся (ложных допусков нет). Если выдаётся —
 *     аудит содержит методологическую ошибку; скрипт завершается кодом 1.
 *  3. Показывает, что даёт шум наблюдения (bid/ask-bounce) при нулевой
 *     реальной предсказуемости: continuation-паттерны (impulse-breakout,
 *     inside-bar, …) уходят ниже 50% — ровно то, что видно в реальных
 *     отчётах, и НЕ является доказательством эджа «наоборот».
 *
 * Использование:
 *   npm run backtest:null-audit
 *   npm run backtest:null-audit -- --bars=120000 --noise=0,0.25 --seeds=1,2 --payout=80
 */
import { fileURLToPath } from 'node:url';
import {
  HORIZON_GRIDS,
  applyDedupedVerdicts,
  auditFeatureSet,
  buildOccurrences,
  computeDedupedStatsWalkForward,
  computeWalkForwardResult,
  type DedupeScope,
  type DedupedContext,
  type Occurrence,
  type PatternResult_,
} from './horizon-audit';
import { assignFoldIndex, computeFoldBoundaries } from './horizon-partitioning';
import { binomialSignificanceTest, MIN_SAMPLES_FOR_SIGNIFICANCE } from './significance';
import { generateRandomWalk } from './synthetic/random-walk';
import { breakevenWinRateFromProfitPercent } from '@/lib/pattern-reliability-calibration';
import { DEFAULT_INDICATOR_CONFIG } from '@/types/domain';

export interface NullAuditOptions {
  bars: number;
  seed: number;
  noiseFraction: number;
  payoutPercent: number;
  folds: number;
  purgeBars: number;
  windowSize: number;
  dedupeScope: DedupeScope;
  indicators: 'live' | 'none';
  /** false — не печатать прогресс детекторов. */
  quiet?: boolean;
}

export interface NullAuditRow {
  patternName: string;
  setupType: string | null;
  totalOccurrences: number;
  rawDecided: number | null;
  rawAccuracy: number | null;
  rawP: number | null;
  independentTestDecided: number;
  dedupedAccuracy: number | null;
  dedupedP: number | null;
  verdict: PatternResult_['verdict'];
}

export interface NullAuditResult {
  rows: NullAuditRow[];
  validCount: number;
  rejectedCount: number;
}

export function runNullAudit(opts: NullAuditOptions): NullAuditResult {
  const candles = generateRandomWalk({ bars: opts.bars, seed: opts.seed, noiseFraction: opts.noiseFraction });
  const { activeFeatures } = auditFeatureSet(opts.indicators);
  const maxExpiry = Math.max(...Object.values(HORIZON_GRIDS).flat());
  const occs = buildOccurrences(
    candles,
    'SYNTH',
    activeFeatures,
    { ...DEFAULT_INDICATOR_CONFIG },
    opts.windowSize,
    maxExpiry,
    () => {
      /* прогресс глушим */
    },
  );

  let minT = Infinity;
  let maxT = -Infinity;
  for (const o of occs) {
    if (o.time < minT) minT = o.time;
    if (o.time > maxT) maxT = o.time;
  }
  const rows: NullAuditRow[] = [];
  if (occs.length === 0) return { rows, validCount: 0, rejectedCount: 0 };

  const barSeconds = 60;
  const boundaries = computeFoldBoundaries(minT, maxT, opts.folds);
  assignFoldIndex(occs, boundaries);
  const purgeSeconds = opts.purgeBars * barSeconds;
  const ctx: DedupedContext = {
    alpha: 0.05,
    minTrainSamples: 30,
    wilsonMargin: 0,
    breakevenRate: breakevenWinRateFromProfitPercent(opts.payoutPercent),
    dedupeScope: opts.dedupeScope,
    barSeconds,
  };

  const groups = new Map<string, Occurrence[]>();
  for (const o of occs) {
    const key = `${o.patternName}|${o.setupType ?? ''}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(o);
  }

  const results: PatternResult_[] = [];
  const meta = new Map<PatternResult_, { name: string; setup: string | null; total: number; raw: ReturnType<typeof computeWalkForwardResult> }>();
  for (const [key, groupOccs] of groups) {
    const [name, setup] = key.split('|');
    const grid = HORIZON_GRIDS[name];
    if (!grid || groupOccs.length < 30) continue;
    const raw = computeWalkForwardResult(groupOccs, grid, boundaries, purgeSeconds, ctx.minTrainSamples);
    const stats = computeDedupedStatsWalkForward(groupOccs, grid, boundaries, purgeSeconds, ctx);
    const r = { status: 'ok', ...stats } as unknown as PatternResult_;
    results.push(r);
    meta.set(r, { name, setup: setup || null, total: groupOccs.length, raw });
  }
  applyDedupedVerdicts(results, { alpha: ctx.alpha, wilsonMargin: ctx.wilsonMargin });

  for (const r of results) {
    const m = meta.get(r)!;
    const rawDecided = m.raw.aggregatedDecided;
    rows.push({
      patternName: m.name,
      setupType: m.setup,
      totalOccurrences: m.total,
      rawDecided: rawDecided > 0 ? rawDecided : null,
      rawAccuracy: rawDecided > 0 ? m.raw.aggregatedWins / rawDecided : null,
      rawP:
        rawDecided >= MIN_SAMPLES_FOR_SIGNIFICANCE
          ? binomialSignificanceTest(m.raw.aggregatedWins, rawDecided, 0.5, ctx.alpha).pValue
          : null,
      independentTestDecided: r.independentTestDecided ?? 0,
      dedupedAccuracy: r.testAccuracyDeduped ?? null,
      dedupedP: r.pValueDeduped ?? null,
      verdict: r.verdict ?? null,
    });
  }
  rows.sort((a, b) => b.totalOccurrences - a.totalOccurrences);
  return {
    rows,
    validCount: rows.filter((r) => r.verdict === 'valid').length,
    rejectedCount: rows.filter((r) => r.verdict === 'rejected').length,
  };
}

function parseList(v: string | undefined, fallback: number[]): number[] {
  if (v === undefined) return fallback;
  const list = v.split(',').map((x) => Number(x.trim()));
  if (list.length === 0 || list.some((x) => !Number.isFinite(x))) {
    console.error(`Invalid list "${v}" (expected comma-separated numbers).`);
    process.exit(1);
  }
  return list;
}

function main(): void {
  const map = new Map<string, string>();
  for (const a of process.argv.slice(2)) {
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) map.set(m[1], m[2]);
  }
  const bars = Number(map.get('bars') ?? 60000);
  const noises = parseList(map.get('noise'), [0, 0.25]);
  const seeds = parseList(map.get('seeds'), [1]);
  const payoutPercent = Number(map.get('payout') ?? 80);
  const dedupeScope = (map.get('dedupe-scope') ?? 'pool') as DedupeScope;
  const indicators = (map.get('indicators') ?? 'live') as 'live' | 'none';
  if (!Number.isFinite(bars) || bars < 2000) {
    console.error('--bars must be a number >= 2000');
    process.exit(1);
  }
  if (!Number.isFinite(payoutPercent) || payoutPercent <= 0) {
    console.error('--payout must be a positive number (percent)');
    process.exit(1);
  }
  if (dedupeScope !== 'pool' && dedupeScope !== 'symbol') {
    console.error('--dedupe-scope must be pool|symbol');
    process.exit(1);
  }
  if (indicators !== 'live' && indicators !== 'none') {
    console.error('--indicators must be live|none');
    process.exit(1);
  }

  let totalValid = 0;
  for (const noise of noises) {
    for (const seed of seeds) {
      console.log(`\n=== null audit: bars=${bars}, noise=${noise}σ, seed=${seed}, payout=${payoutPercent}% ===`);
      const t0 = Date.now();
      const res = runNullAudit({
        bars,
        seed,
        noiseFraction: noise,
        payoutPercent,
        folds: 8,
        purgeBars: 30,
        windowSize: 500,
        dedupeScope,
        indicators,
      });
      console.log(`(${((Date.now() - t0) / 1000).toFixed(0)}s)`);
      console.log('pattern'.padEnd(30) + 'occ'.padStart(7) + 'raw n'.padStart(8) + 'raw acc'.padStart(9) + 'raw p'.padStart(9) + 'indep n'.padStart(9) + 'dedup acc'.padStart(11) + 'dedup p'.padStart(9) + '  verdict');
      for (const r of res.rows) {
        console.log(
          `${r.patternName}${r.setupType ? `#${r.setupType}` : ''}`.padEnd(30) +
            String(r.totalOccurrences).padStart(7) +
            (r.rawDecided !== null ? String(r.rawDecided) : '—').padStart(8) +
            (r.rawAccuracy !== null ? `${(r.rawAccuracy * 100).toFixed(1)}%` : '—').padStart(9) +
            (r.rawP !== null ? r.rawP.toFixed(3) : '—').padStart(9) +
            String(r.independentTestDecided).padStart(9) +
            (r.dedupedAccuracy !== null ? `${(r.dedupedAccuracy * 100).toFixed(1)}%` : '—').padStart(11) +
            (r.dedupedP !== null ? r.dedupedP.toFixed(3) : '—').padStart(9) +
            `  ${r.verdict ?? '—'}`,
        );
      }
      console.log(`valid=${res.validCount} (must be 0), rejected=${res.rejectedCount}`);
      totalValid += res.validCount;
    }
  }
  if (totalValid > 0) {
    console.error(`\nFAIL: ${totalValid} pattern(s) passed the 'valid' verdict on data with no predictability — the audit methodology is leaking.`);
    process.exit(1);
  }
  console.log('\nOK: no pattern passed the valid verdict on random data.');
}

const isDirectRun = (() => {
  try {
    return process.argv[1] === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
})();

if (isDirectRun) {
  try {
    main();
    process.exit(0);
  } catch (err: unknown) {
    console.error('Null audit failed:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
