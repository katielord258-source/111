import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DEFAULT_INDICATOR_CONFIG } from '@/types/domain';
import { computeIndicatorSeriesRaw, snapshotFromSeries } from '@/compute/IndicatorAggregator';
import { generateSyntheticHarmonicDataset } from './synthetic/harmonic-data';
import { buildOccurrences } from './horizon-audit';

// A'.3 — golden-guard оптимизации buildOccurrences.
//
// Тест намеренно берёт ИНДИКАТОРО-ЗАВИСИМЫЙ набор фич. Предыдущая версия
// этого guard'а (ветка A) фиксировала поведение на activeFeatures =
// ['inside-bar'] — чисто ценовом паттерне, который индикаторы не читает, —
// и потому не проверяла ровно тот путь, ради которого писалась.

const HERE = dirname(fileURLToPath(import.meta.url));

const fixture = JSON.parse(
  readFileSync(join(HERE, 'fixtures', 'harmonic-occurrences-golden.json'), 'utf8'),
) as {
  seed: number;
  occurrences: Array<{
    patternName: string;
    barIndex: number;
    direction: 'buy' | 'sell';
    outcomes: Record<string, number>;
  }>;
};

function makeDataset() {
  return generateSyntheticHarmonicDataset({
    seed: fixture.seed,
    warmupBars: 200,
    trailingBars: 120,
    legBars: 30,
    bridgeBars: 24,
    xaFraction: 0.08,
  });
}

describe('buildOccurrences regression guard', () => {
  it('matches the project fixture for the synthetic harmonic baseline', { timeout: 30000 }, () => {
    const dataset = makeDataset();

    const occurrences = buildOccurrences(
      dataset.candles,
      'SYNTH',
      ['harmonic-pattern'],
      DEFAULT_INDICATOR_CONFIG,
      // BUGFIX: раньше здесь стоял windowSize=80. Полный размах внедрённого
      // гармонического паттерна (X→A→B→C→D, см. synthetic/harmonic-data.ts)
      // на этих параметрах датасета — 120 баров (dataset.meta.maxSpanBars).
      // При windowSize=80 детектор физически не мог увидеть паттерн целиком
      // ни в одном скользящем окне — occurrences всегда было 0, и golden-
      // фикстура (occurrences: []) сравнивала 0 с 0: тест проходил при ЛЮБОЙ
      // поломке детектора, включая полное отключение обнаружения. windowSize
      // здесь должен быть заметно больше maxSpanBars — 300 даёт устойчивые
      // 103 срабатывания на этом датасете (проверено вручную по сетке
      // 80/150/200/300/500 — ниже 200 сигнала нет вообще, на 300 он самый
      // сильный).
      300,
      20,
      () => {
        /* прогресс глушим — тест не должен шуметь в stdout */
      },
    );

    // Страховка от повторения самой этой ошибки в будущем: если кто-то снова
    // уменьшит windowSize или сломает детектор так, что occurrences опустеют,
    // тест должен упасть ЗДЕСЬ, с понятным сообщением — а не молча пройти
    // сравнение пустого массива с пустой фикстурой.
    expect(occurrences.length, 'buildOccurrences вернул 0 occurrences — golden-guard бессмысленен на пустом результате').toBeGreaterThan(0);
    expect(dataset.meta.maxSpanBars, 'sanity: датасет должен реально содержать многобарный паттерн').toBeGreaterThan(0);

    expect(occurrences.length).toBe(fixture.occurrences.length);

    const projected = occurrences
      .filter(({ patternName }) => patternName === 'harmonic-pattern')
      .map(({ patternName, barIndex, direction, outcomes }) => ({
        patternName,
        barIndex,
        direction,
        outcomes: Object.fromEntries(Array.from(outcomes.entries()).map(([k, v]) => [String(k), v])),
      }));

    expect(projected).toEqual(fixture.occurrences);
  });
});

describe('индикаторная серия бэктеста: причинность (анти-look-ahead)', () => {
  const dataset = makeDataset();
  const features = ['harmonic-pattern', 'rsi', 'atr', 'bollinger', 'mean-reversion'] as const;

  it('серия считается на всю длину массива', () => {
    const series = computeIndicatorSeriesRaw(dataset.candles, DEFAULT_INDICATOR_CONFIG, [...features]);
    expect(series.rsi).not.toBeNull();
    expect(series.rsi).toHaveLength(dataset.candles.length);
    expect(series.atr).toHaveLength(dataset.candles.length);
    expect(series.adx).toHaveLength(dataset.candles.length);
  });

  it('РЕГРЕССИЯ: значение на баре i не зависит от баров после i', () => {
    // Ключевая проверка. Удалённая реализация computeIndicatorsSeries брала
    // atr/adx/vwap/meanReversionRsi/impulseVelocity/volumeProfilePoc из
    // snapshot — т.е. из ПОСЛЕДНЕГО бара всего датасета — и ставила это
    // значение на каждый бар. Обрезание хвоста массива такую подмену ловит
    // мгновенно, а проверка «rsi на баре 150 не null» — нет.
    const cfg = DEFAULT_INDICATOR_CONFIG;
    const full = computeIndicatorSeriesRaw(dataset.candles, cfg, [...features]);
    const i = Math.floor(dataset.candles.length * 0.6);
    const truncated = computeIndicatorSeriesRaw(dataset.candles.slice(0, i + 1), cfg, [...features]);

    const atFull = snapshotFromSeries(full, i);
    const atTruncated = snapshotFromSeries(truncated, i);

    expect(atTruncated).toEqual(atFull);
  });

  it('РЕГРЕССИЯ: причинные поля не являются константой по всему массиву', () => {
    // Вторая страховка от broadcast'а одного значения на все бары: если
    // кто-то снова подставит snapshot.X, серия станет константной.
    const series = computeIndicatorSeriesRaw(dataset.candles, DEFAULT_INDICATOR_CONFIG, [...features]);
    for (const key of ['rsi', 'atr', 'adx', 'meanReversionRsi'] as const) {
      const arr = series[key];
      expect(arr, `${key} должен быть посчитан`).not.toBeNull();
      const distinct = new Set((arr ?? []).filter((v) => v !== null));
      expect(distinct.size, `${key} выглядит как одно значение, размноженное на все бары`).toBeGreaterThan(1);
    }
  });

  it('не причинные поля отдаются как null, а не как значение последнего бара', () => {
    const series = computeIndicatorSeriesRaw(dataset.candles, DEFAULT_INDICATOR_CONFIG, [...features]);
    const snap = snapshotFromSeries(series, 300);
    expect(snap.vwap).toBeNull();
    expect(snap.volumeProfilePoc).toBeNull();
    expect(snap.impulseVelocity).toBeNull();
  });
});
