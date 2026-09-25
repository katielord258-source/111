import type { Candle, IndicatorConfig, IndicatorSnapshot, IndicatorSeries, FeatureName } from '@/types/domain';
import { rsi as calcRsi } from '@/compute/indicators/rsi';
import { ema } from '@/compute/indicators/ema';
import { macd } from '@/compute/indicators/macd';
import { atr } from '@/compute/indicators/atr';
import { bollinger } from '@/compute/indicators/bollinger';
import { vwapLast, vwapSessionPeriod } from '@/compute/indicators/vwap';
import { volumeProfilePocWithMeta } from '@/compute/indicators/volume-profile';
import { computeImpulseVelocity } from '@/compute/indicators/impulse-velocity';
import { adx as calcAdx } from '@/compute/indicators/adx';
import { lastNonNull, zipTime } from '@/compute/indicators/helpers';

export interface ComputeResult {
  snapshot: IndicatorSnapshot;
  series: IndicatorSeries;
}

const NULL_SNAPSHOT: IndicatorSnapshot = {
  rsi: null,
  emaFast: null,
  emaSlow: null,
  macd: null,
  macdSignal: null,
  macdHistogram: null,
  atr: null,
  bollingerUpper: null,
  bollingerMiddle: null,
  bollingerLower: null,
  vwap: null,
  vwapIsProxyVolume: false,
  volumeProfilePoc: null,
  volumeProfilePocIsProxyVolume: false,
  meanReversionRsi: null,
  impulseVelocity: null,
  adx: null,
};

export function computeIndicators(
  candles: Candle[],
  config: IndicatorConfig,
  activeFeatures: FeatureName[] = [],
): ComputeResult {
  // ВАЖНО: пустой activeFeatures означает «ничего не выбрано», а не «фильтра
  // нет — считать всё». Раньше здесь был шорткат `computeAll()` для пустого
  // массива, из-за которого кнопка «выключить все индикаторы» в UI приводила
  // к прямо противоположному эффекту — включались вообще все индикаторы.
  // См. также direction-prediction.ts, signal-filters.ts, patterns/index.ts,
  // full-snapshot.ts — тот же баг был устранён в тех же местах одинаково.
  const has = (name: FeatureName) => activeFeatures.includes(name);
  const closes = candles.map((c) => c.close);

  const needRsi = has('rsi') || has('mean-reversion') || has('macd-deceleration-continuation');
  const needEma = has('ema') || has('macd');
  const needMacd = has('macd');
  // ATR is also required directly by macd-deceleration-continuation.ts for
  // its news-spike invalidator (flip bar wider than 2×ATR) — without this,
  // that gate would silently no-op when the user enables only this
  // strategy without 'atr' (same class of bug as needRsi/needAdx above; see
  // Аудит «Замедление MACD с продолжением», follow-up 2026-08-31: originally
  // left out of scope, now wired through on request).
  const needAtr = has('atr') || has('macd-deceleration-continuation');
  const needBoll = has('bollinger');
  // ADX is used alongside ATR for trend strength, and independently as the
  // hard trend-confirmation gate inside macd-deceleration-continuation.ts —
  // without this it silently disables when the user enables only that
  // strategy without 'atr' (same class of bug as the RSI fix above; see
  // Аудит «Замедление MACD с продолжением», п.1/п.4).
  const needAdx = has('atr') || has('macd-deceleration-continuation');

  const rsiArr = needRsi ? calcRsi(closes, config.rsiPeriod) : null;
  const emaFastArr = needEma ? ema(closes, config.emaFast) : null;
  const emaSlowArr = needEma ? ema(closes, config.emaSlow) : null;
  const macdResult = needMacd ? macd(closes, config.macdFast, config.macdSlow, config.macdSignal) : null;
  const atrArr = needAtr ? atr(candles, config.atrPeriod) : null;
  const boll = needBoll ? bollinger(closes, config.bbPeriod, config.bbStdDev) : null;
  const adxVal = needAdx ? lastNonNull(calcAdx(candles, 14)) : null;

  const vwapResult = has('vwap')
    ? vwapLast(candles, vwapSessionPeriod(candles))
    : { value: null, isProxyVolume: false };
  // BUGFIX (аудит 2026-09-12, п.5): тот же класс проблемы, что и у VWAP —
  // POC считался по всему буферу (до ~600 M1-баров/10 часов), а не по
  // сессии/дню, как принято для Point of Control. В отличие от VWAP это не
  // источник ложных сигналов (volumeProfilePoc нигде не читается ни одной
  // стратегией/фильтром — только отображается в UI), поэтому чинится здесь
  // же, для корректности самого индикатора на графике, тем же дневным окном.
  const vpCandles = candles.slice(-vwapSessionPeriod(candles));
  const vpResult = has('volume-profile')
    ? volumeProfilePocWithMeta(vpCandles)
    : { poc: null, isProxyVolume: false };

  const snapshot: IndicatorSnapshot = {
    rsi: rsiArr ? lastNonNull(rsiArr) : null,
    emaFast: emaFastArr ? lastNonNull(emaFastArr) : null,
    emaSlow: emaSlowArr ? lastNonNull(emaSlowArr) : null,
    macd: macdResult ? lastNonNull(macdResult.macd) : null,
    macdSignal: macdResult ? lastNonNull(macdResult.signal) : null,
    macdHistogram: macdResult ? lastNonNull(macdResult.histogram) : null,
    atr: atrArr ? lastNonNull(atrArr) : null,
    bollingerUpper: boll ? lastNonNull(boll.upper) : null,
    bollingerMiddle: boll ? lastNonNull(boll.middle) : null,
    bollingerLower: boll ? lastNonNull(boll.lower) : null,
    vwap: vwapResult.value,
    vwapIsProxyVolume: vwapResult.isProxyVolume,
    volumeProfilePoc: vpResult.poc,
    volumeProfilePocIsProxyVolume: vpResult.isProxyVolume,
    meanReversionRsi: has('mean-reversion') ? lastNonNull(calcRsi(closes, 7)) : null,
    impulseVelocity: has('impulse-velocity') ? computeImpulseVelocity(candles, config.atrPeriod) : null,
    adx: adxVal,
  };

  const series: IndicatorSeries = {
    rsi: rsiArr ? zipTime(candles, rsiArr) : [],
    emaFast: emaFastArr ? zipTime(candles, emaFastArr) : [],
    emaSlow: emaSlowArr ? zipTime(candles, emaSlowArr) : [],
    macd: macdResult ? zipTime(candles, macdResult.macd) : [],
    macdSignal: macdResult ? zipTime(candles, macdResult.signal) : [],
    macdHistogram: macdResult ? zipTime(candles, macdResult.histogram) : [],
    bollingerUpper: boll ? zipTime(candles, boll.upper) : [],
    bollingerMiddle: boll ? zipTime(candles, boll.middle) : [],
    bollingerLower: boll ? zipTime(candles, boll.lower) : [],
  };

  return { snapshot, series };
}

export function computeSnapshot(
  candles: Candle[],
  config: IndicatorConfig,
  activeFeatures: FeatureName[] = [],
): IndicatorSnapshot {
  if (candles.length === 0) return { ...NULL_SNAPSHOT };
  return computeIndicators(candles, config, activeFeatures).snapshot;
}

/**
 * Pre-computes indicator arrays over the FULL candle series so that the
 * backtest (`backtest/horizon-audit.ts::buildOccurrences`) can index
 * per-bar in O(1) instead of recomputing indicators on a `windowSize`
 * slice at every iteration (O(N×W) plus N slice allocations).
 *
 * ВАЖНО, две вещи, которые здесь легко перепутать (см. разбор
 * 2026-09-18, раздел «look-ahead»):
 *
 * 1. Никакого заглядывания в будущее здесь НЕТ: каждый индикатор —
 *    однопроходный причинный расчёт, result[i] зависит только от
 *    candles[0..i]. Индексация result[i] законна. Категорически нельзя
 *    подставлять на каждый бар `snapshot.X` (значение ПОСЛЕДНЕГО бара
 *    всего массива) — именно так была внесена утечка в предыдущей
 *    реализации `computeIndicatorsSeries`.
 *
 * 2. Это НЕ бит-в-бит эквивалент прежнего `computeIndicators(window, …)`:
 *    раньше рекурсивные сглаживания Уайлдера (RSI/ATR/ADX) и EMA
 *    прогревались от бара i−windowSize+1, теперь — от бара 0. Значения
 *    сходятся экспоненциально и на windowSize=500 расходятся в пределах
 *    шума, но формально это СМЕНА поведения в лучшую сторону (полный
 *    прогрев), а не оптимизация «без изменения результата».
 *
 * Поля, которых нет в виде причинной серии (`vwap`, `volumeProfilePoc`,
 * `impulseVelocity`), возвращаются как null — сознательно, чтобы не
 * подставлять в них значение последнего бара. Ни один детектор в
 * `src/compute/patterns/` их не читает (потребитель только
 * `signal-builder.ts::buildFeatureVector`, который в бэктесте не
 * вызывается), поэтому расхождения в результатах это не даёт.
 *
 * Returns raw arrays (not zipped with time) indexed by bar position.
 */
export interface IndicatorSeriesRaw {
  rsi: (number | null)[] | null;
  emaFast: (number | null)[] | null;
  emaSlow: (number | null)[] | null;
  macd: (number | null)[] | null;
  macdSignal: (number | null)[] | null;
  macdHistogram: (number | null)[] | null;
  atr: (number | null)[] | null;
  bollingerUpper: (number | null)[] | null;
  bollingerMiddle: (number | null)[] | null;
  bollingerLower: (number | null)[] | null;
  meanReversionRsi: (number | null)[] | null;
  adx: (number | null)[] | null;
}

export function computeIndicatorSeriesRaw(
  candles: Candle[],
  config: IndicatorConfig,
  activeFeatures: FeatureName[] = [],
): IndicatorSeriesRaw {
  // Гейтинг фич ОБЯЗАН совпадать с computeIndicators() выше — иначе
  // бэктест и продакшен считают разный набор индикаторов. Любое
  // изменение needXxx там должно быть продублировано здесь (закреплено
  // тестом src/compute/indicator-series-parity.test.ts).
  const has = (name: FeatureName) => activeFeatures.includes(name);
  const closes = candles.map((c) => c.close);

  const needRsi = has('rsi') || has('mean-reversion') || has('macd-deceleration-continuation');
  const needEma = has('ema') || has('macd');
  const needMacd = has('macd');
  const needAtr = has('atr') || has('macd-deceleration-continuation');
  const needBoll = has('bollinger');
  const needAdx = has('atr') || has('macd-deceleration-continuation');

  const rsiArr = needRsi ? calcRsi(closes, config.rsiPeriod) : null;
  const emaFastArr = needEma ? ema(closes, config.emaFast) : null;
  const emaSlowArr = needEma ? ema(closes, config.emaSlow) : null;
  const macdResult = needMacd ? macd(closes, config.macdFast, config.macdSlow, config.macdSignal) : null;
  const atrArr = needAtr ? atr(candles, config.atrPeriod) : null;
  const boll = needBoll ? bollinger(closes, config.bbPeriod, config.bbStdDev) : null;
  const adxArr = needAdx ? calcAdx(candles, 14) : null;
  const meanRevRsiArr = has('mean-reversion') ? calcRsi(closes, 7) : null;

  return {
    rsi: rsiArr,
    emaFast: emaFastArr,
    emaSlow: emaSlowArr,
    macd: macdResult?.macd ?? null,
    macdSignal: macdResult?.signal ?? null,
    macdHistogram: macdResult?.histogram ?? null,
    atr: atrArr,
    bollingerUpper: boll?.upper ?? null,
    bollingerMiddle: boll?.middle ?? null,
    bollingerLower: boll?.lower ?? null,
    meanReversionRsi: meanRevRsiArr,
    adx: adxArr,
  };
}

/**
 * Builds a per-bar IndicatorSnapshot from pre-computed raw arrays.
 * O(1) — just array indexing, no recomputation, no look-ahead.
 */
export function snapshotFromSeries(
  series: IndicatorSeriesRaw,
  i: number,
): IndicatorSnapshot {
  const at = (arr: (number | null)[] | null): number | null =>
    arr && i >= 0 && i < arr.length ? arr[i] : null;
  return {
    rsi: at(series.rsi),
    emaFast: at(series.emaFast),
    emaSlow: at(series.emaSlow),
    macd: at(series.macd),
    macdSignal: at(series.macdSignal),
    macdHistogram: at(series.macdHistogram),
    atr: at(series.atr),
    bollingerUpper: at(series.bollingerUpper),
    bollingerMiddle: at(series.bollingerMiddle),
    bollingerLower: at(series.bollingerLower),
    // Не причинные серии — см. комментарий к computeIndicatorSeriesRaw.
    vwap: null,
    vwapIsProxyVolume: false,
    volumeProfilePoc: null,
    volumeProfilePocIsProxyVolume: false,
    meanReversionRsi: at(series.meanReversionRsi),
    impulseVelocity: null,
    adx: at(series.adx),
  };
}
