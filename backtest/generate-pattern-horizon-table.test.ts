import { describe, expect, it } from 'vitest';
import {
  assetClassOfSymbol,
  classifyResult,
  mergeRecords,
  buildTable,
  renderTable,
  type PatternResultJson,
  type AuditJson,
} from './generate-pattern-horizon-table';
import { isCrypto } from '@/data/symbols';
import { SYMBOLS } from '@/data/symbols';

const ALPHA = 0.05;

function result(over: Partial<PatternResultJson> = {}): PatternResultJson {
  return {
    patternName: 'harmonic-pattern',
    setupType: null,
    bestExpiryBars: 30,
    testAccuracy: 0.55,
    testCount: 670,
    pValue: 0.0096,
    significant: true,
    passesWilsonGate: true,
    status: 'ok',
    ...over,
  };
}

function audit(symbols: string[], results: PatternResultJson[]): AuditJson {
  return {
    meta: {
      symbols,
      timeframe: '1m',
      from: '2026-08-15',
      to: '2026-09-16',
      split: 'walkforward',
      alpha: ALPHA,
      generatedAt: '2026-09-18T00:00:00.000Z',
    },
    results,
  };
}

describe('assetClassOfSymbol', () => {
  it('совпадает с isCrypto() из src/data/symbols для всех известных символов', () => {
    for (const s of SYMBOLS) {
      expect(assetClassOfSymbol(s.id), s.id).toBe(isCrypto(s.id) ? 'crypto' : 'forex');
    }
  });
});

describe('classifyResult', () => {
  it('valid: значимо вверх + Wilson pass', () => {
    expect(classifyResult(result(), 'run', ALPHA)?.status).toBe('valid');
  });

  it('rejected: значимо ВНИЗ', () => {
    const r = classifyResult(
      result({ testAccuracy: 0.4635, pValue: 0.00606, significant: true, passesWilsonGate: false }),
      'run',
      ALPHA,
    );
    expect(r?.status).toBe('rejected');
  });

  it('РЕГРЕССИЯ: significant=true при accuracy<50% не считается допуском', () => {
    // Старый holmBonferroni затирал направленное условие, и такие строки
    // лежат в уже сохранённых отчётах. Генератор обязан их перепроверять.
    const r = classifyResult(result({ testAccuracy: 0.46, pValue: 0.006, significant: true }), 'run', ALPHA);
    expect(r?.status).not.toBe('valid');
  });

  it('РЕГРЕССИЯ: significant=false — это no-evidence, а не rejected', () => {
    const r = classifyResult(
      result({ patternName: 'inside-bar', testAccuracy: 0.4989, pValue: 0.8685, significant: false, passesWilsonGate: false }),
      'run',
      ALPHA,
    );
    expect(r?.status).toBe('no-evidence');
  });

  it('значимо вверх, но без Wilson — no-evidence, не rejected', () => {
    const r = classifyResult(result({ passesWilsonGate: false }), 'run', ALPHA);
    expect(r?.status).toBe('no-evidence');
    expect(r?.note).toMatch(/Wilson/);
  });

  it('status !== ok и отсутствующие числа записи не дают', () => {
    expect(classifyResult(result({ status: 'insufficient-data' }), 'run', ALPHA)).toBeNull();
    expect(classifyResult(result({ bestExpiryBars: null }), 'run', ALPHA)).toBeNull();
    expect(classifyResult(result({ testAccuracy: null }), 'run', ALPHA)).toBeNull();
  });
});

describe('mergeRecords', () => {
  const noop = () => {};

  it('rejected побеждает valid (консервативно)', () => {
    const valid = classifyResult(result(), 'a', ALPHA)!;
    const rejected = classifyResult(result({ testAccuracy: 0.44, pValue: 0.017, significant: false }), 'b', ALPHA)!;
    expect(mergeRecords(valid, rejected, noop, 'x').status).toBe('rejected');
    expect(mergeRecords(rejected, valid, noop, 'x').status).toBe('rejected');
  });

  it('valid побеждает no-evidence', () => {
    const valid = classifyResult(result(), 'a', ALPHA)!;
    const none = classifyResult(result({ significant: false, pValue: 0.4 }), 'b', ALPHA)!;
    expect(mergeRecords(none, valid, noop, 'x').status).toBe('valid');
  });

  it('два valid с разным горизонтом деградируют до no-evidence и сообщают', () => {
    const a = classifyResult(result({ bestExpiryBars: 30 }), 'a', ALPHA)!;
    const b = classifyResult(result({ bestExpiryBars: 10 }), 'b', ALPHA)!;
    const msgs: string[] = [];
    const merged = mergeRecords(a, b, (m) => msgs.push(m), 'crypto/harmonic-pattern');
    expect(merged.status).toBe('no-evidence');
    expect(msgs).toHaveLength(1);
  });
});

describe('buildTable', () => {
  it('РЕГРЕССИЯ: крипто-результат не перебивает форекс-результат', () => {
    const files = [
      { name: 'horizon-audit-crypto.json', data: audit(['BTCUSDT', 'ETHUSDT'], [result()]) },
      {
        name: 'horizon-audit-forex.json',
        data: audit(
          ['EURUSD', 'USDJPY'],
          [result({ bestExpiryBars: 20, testAccuracy: 0.4398, pValue: 0.01724, significant: false, passesWilsonGate: false })],
        ),
      },
    ];
    const table = buildTable(files, () => {});
    expect(table.crypto['harmonic-pattern'].status).toBe('valid');
    expect(table.forex['harmonic-pattern'].status).toBe('rejected');
  });

  it('детерминизм: порядок входных файлов не влияет на результат', () => {
    const a = { name: 'horizon-audit-a.json', data: audit(['BTCUSDT'], [result({ significant: false, pValue: 0.4 })]) };
    const b = { name: 'horizon-audit-b.json', data: audit(['ETHUSDT'], [result()]) };
    const forward = renderTable(buildTable([a, b], () => {}), []);
    const backward = renderTable(buildTable([b, a], () => {}), []);
    expect(forward).toBe(backward);
  });

  it('смешанный по классам пул пропускается с предупреждением', () => {
    const warnings: string[] = [];
    const table = buildTable(
      [{ name: 'horizon-audit-mixed.json', data: audit(['BTCUSDT', 'EURUSD'], [result()]) }],
      (m) => warnings.push(m),
    );
    expect(Object.keys(table.crypto)).toHaveLength(0);
    expect(Object.keys(table.forex)).toHaveLength(0);
    expect(warnings).toHaveLength(1);
  });

  it('разные setupType одного паттерна — НЕЗАВИСИМЫЕ записи, а не консервативное схлопывание', () => {
    const warnings: string[] = [];
    const table = buildTable(
      [
        {
          name: 'horizon-audit-crypto.json',
          data: audit(
            ['BTCUSDT'],
            [
              result({ setupType: 'continuation' }),
              result({ setupType: 'reversal', testAccuracy: 0.44, pValue: 0.01, significant: false }),
            ],
          ),
        },
      ],
      (m) => warnings.push(m),
    );
    // Фаза B'.3: каждый setupType получает свою запись в таблице.
    expect(table.crypto['harmonic-pattern#continuation'].status).toBe('valid');
    expect(table.crypto['harmonic-pattern#reversal'].status).toBe('rejected');
    // Плоский ключ для null-setupType не затрагивается.
    expect(table.crypto['harmonic-pattern']).toBeUndefined();
  });

  it('РЕГРЕССИЯ: null setupType использует плоский ключ patternName', () => {
    const table = buildTable(
      [
        {
          name: 'horizon-audit-crypto.json',
          data: audit(['BTCUSDT'], [result({ setupType: null })]),
        },
      ],
      () => {},
    );
    expect(table.crypto['harmonic-pattern']).toBeDefined();
    expect(table.crypto['harmonic-pattern'].status).toBe('valid');
    expect(table.crypto['harmonic-pattern#continuation']).toBeUndefined();
  });
});

describe('renderTable', () => {
  it('пустая таблица — валидный TS с обоими классами активов', () => {
    const out = renderTable({ crypto: {}, forex: {} }, []);
    expect(out).toContain('crypto: {},');
    expect(out).toContain('forex: {},');
    expect(out).toContain('PATTERN_HORIZON_TABLE');
  });

  it('имена и sourceRun экранируются', () => {
    const table = buildTable(
      [{ name: "horizon-audit-o'dd.json", data: audit(['BTCUSDT'], [result()]) }],
      () => {},
    );
    const out = renderTable(table, ["o'dd"]);
    expect(out).toContain('"o\'dd"');
  });
});
