import { describe, expect, it } from 'vitest';
import {
  auditFileFreshness,
  buildTable,
  classifyResult,
  classifyResultDeduped,
  type AuditJson,
  type PatternResultJson,
} from './generate-pattern-horizon-table';
import { OCCURRENCE_ALGORITHM_VERSION, AUDIT_SCHEMA_VERSION } from './audit-version';

const ALPHA = 0.05;

/** Отчёт схемы 2: harmonic-pattern «валиден» по сырым данным, но не по независимым. */
function harmonicV2(over: Partial<PatternResultJson> = {}): PatternResultJson {
  return {
    patternName: 'harmonic-pattern',
    setupType: null,
    bestExpiryBars: 30,
    testAccuracy: 0.532,
    testCount: 10792,
    pValue: 0,
    significant: true,
    passesWilsonGate: true,
    status: 'ok',
    independentTestDecided: 1000,
    testAccuracyDeduped: 0.52,
    pValueDeduped: 0.1739,
    wilsonLowerBoundDeduped: 0.489,
    passesWilsonGateDeduped: false,
    requiredWinRate: 0.5556,
    significantDeduped: false,
    ...over,
  };
}

function auditV2(symbols: string[], results: PatternResultJson[], metaOver: Partial<AuditJson['meta']> = {}): AuditJson {
  return {
    meta: {
      symbols,
      timeframe: '1m',
      from: '2026-03-01',
      to: '2026-09-17',
      split: 'walkforward',
      alpha: ALPHA,
      wilsonMargin: 0,
      auditSchemaVersion: AUDIT_SCHEMA_VERSION,
      algorithmVersion: OCCURRENCE_ALGORITHM_VERSION,
      generatedAt: '2026-09-21T00:00:00.000Z',
      ...metaOver,
    },
    results,
  };
}

describe('classifyResultDeduped', () => {
  it('РЕГРЕССИЯ: harmonic (сырой p=0, дедуп. p=0.17) — no-evidence, тогда как legacy-классификация даёт valid', () => {
    const r = harmonicV2();
    expect(classifyResult(r, 'run', ALPHA)?.status).toBe('valid'); // прежнее (ошибочное) поведение legacy
    const rec = classifyResultDeduped(r, 'run', ALPHA, 0)!;
    expect(rec.status).toBe('no-evidence');
    // entry — дедуплицированные значения, а не сырые
    expect(rec.entry!.accuracy).toBe(0.52);
    expect(rec.entry!.testCount).toBe(1000);
    expect(rec.entry!.pValue).toBeCloseTo(0.1739, 4);
    expect(rec.entry!.significant).toBe(false);
  });

  it('valid: дедуп. значимость + Wilson LB выше требуемой доли', () => {
    const rec = classifyResultDeduped(
      harmonicV2({
        testAccuracyDeduped: 0.62,
        pValueDeduped: 0.0001,
        significantDeduped: true,
        wilsonLowerBoundDeduped: 0.58,
        passesWilsonGateDeduped: true,
      }),
      'run',
      ALPHA,
      0,
    )!;
    expect(rec.status).toBe('valid');
    expect(rec.entry!.passesWilsonGate).toBe(true);
    expect(rec.note).toBeUndefined();
  });

  it('значимо, но LB не выше безубыточности — no-evidence с пояснением', () => {
    const rec = classifyResultDeduped(
      harmonicV2({
        testAccuracyDeduped: 0.56,
        pValueDeduped: 0.003,
        significantDeduped: true,
        wilsonLowerBoundDeduped: 0.52,
        passesWilsonGateDeduped: true,
      }),
      'run',
      ALPHA,
      0,
    )!;
    expect(rec.status).toBe('no-evidence');
    expect(rec.note).toMatch(/breakeven/);
  });

  it('rejected: значимо ниже 50% на независимых наблюдениях', () => {
    const rec = classifyResultDeduped(
      harmonicV2({
        patternName: 'impulse-breakout',
        testAccuracy: 0.451,
        testAccuracyDeduped: 0.451,
        pValueDeduped: 0,
        significantDeduped: false,
        wilsonLowerBoundDeduped: 0.444,
      }),
      'run',
      ALPHA,
      0,
    )!;
    expect(rec.status).toBe('rejected');
  });

  it('РЕГРЕССИЯ: rejected по сырому p, но НЕ по независимым — уже не rejected', () => {
    // Сырой p=0.0009 (n раздут), на независимых p=0.3 — подавлять сигнал нет оснований.
    const r = harmonicV2({
      patternName: 'pin-bar',
      testAccuracy: 0.453,
      pValue: 0.0009,
      significant: false,
      testAccuracyDeduped: 0.47,
      pValueDeduped: 0.3,
      significantDeduped: false,
      wilsonLowerBoundDeduped: 0.42,
    });
    expect(classifyResult(r, 'run', ALPHA)?.status).toBe('rejected'); // legacy
    expect(classifyResultDeduped(r, 'run', ALPHA, 0)?.status).toBe('no-evidence');
  });

  it('меньше порога независимых наблюдений: entry по сырым числам (нужен expiry), статус no-evidence', () => {
    const rec = classifyResultDeduped(
      harmonicV2({ testAccuracyDeduped: null, pValueDeduped: null, significantDeduped: null, wilsonLowerBoundDeduped: null, independentTestDecided: 120 }),
      'run',
      ALPHA,
      0,
    )!;
    expect(rec.status).toBe('no-evidence');
    expect(rec.entry!.expiryBars).toBe(30);
    expect(rec.entry!.pValue).toBeNull();
    expect(rec.entry!.testCount).toBe(120);
  });

  it('status !== ok и отсутствие expiry/точности записи не дают', () => {
    expect(classifyResultDeduped(harmonicV2({ status: 'insufficient-data' }), 'r', ALPHA, 0)).toBeNull();
    expect(classifyResultDeduped(harmonicV2({ bestExpiryBars: null }), 'r', ALPHA, 0)).toBeNull();
    expect(
      classifyResultDeduped(harmonicV2({ testAccuracy: null, testAccuracyDeduped: null }), 'r', ALPHA, 0),
    ).toBeNull();
  });
});

describe('buildTable: выбор классификации по auditSchemaVersion', () => {
  it('схема 2 → дедуп-классификация; отсутствие поля → legacy (закоммиченная таблица не «едет»)', () => {
    const v2 = auditV2(['BTCUSDT', 'ETHUSDT'], [harmonicV2()]);
    const legacy: AuditJson = {
      ...v2,
      meta: { ...v2.meta, auditSchemaVersion: undefined, algorithmVersion: undefined },
    };
    const warn = () => {};
    expect(buildTable([{ name: 'horizon-audit-x.json', data: v2 }], warn).crypto['harmonic-pattern'].status).toBe('no-evidence');
    expect(buildTable([{ name: 'horizon-audit-x.json', data: legacy }], warn).crypto['harmonic-pattern'].status).toBe('valid');
  });

  it('предупреждения buildTable схемой не затрагиваются (legacy-предупреждение печатает main)', () => {
    const warnings: string[] = [];
    const legacy = auditV2(['EURUSD'], [harmonicV2()], { auditSchemaVersion: undefined });
    buildTable([{ name: 'horizon-audit-x.json', data: legacy }], (m) => warnings.push(m));
    expect(warnings).toEqual([]);
  });
});

describe('auditFileFreshness', () => {
  it('ok: схема 2 и текущая версия алгоритма', () => {
    expect(auditFileFreshness(auditV2(['EURUSD'], []))).toBe('ok');
  });
  it('legacy: нет auditSchemaVersion или он < 2', () => {
    expect(auditFileFreshness(auditV2(['EURUSD'], [], { auditSchemaVersion: undefined }))).toBe('legacy');
    expect(auditFileFreshness(auditV2(['EURUSD'], [], { auditSchemaVersion: 1 }))).toBe('legacy');
  });
  it('stale: схема 2, но версия алгоритма другая (или отсутствует)', () => {
    expect(auditFileFreshness(auditV2(['EURUSD'], [], { algorithmVersion: OCCURRENCE_ALGORITHM_VERSION - 1 }))).toBe('stale');
    expect(auditFileFreshness(auditV2(['EURUSD'], [], { algorithmVersion: undefined }))).toBe('stale');
  });
  it('учитывает переданную «текущую» версию', () => {
    expect(auditFileFreshness(auditV2(['EURUSD'], [], { algorithmVersion: 7 }), 7)).toBe('ok');
  });
});
