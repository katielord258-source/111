import type { Candle } from '@/types/domain';

/**
 * Синтетическое случайное блуждание для «нулевого» (плацебо) теста аудита.
 *
 * Цена — мартингал: направление следующего движения по построению НЕ
 * предсказуемо, поэтому любой паттерн на таких данных обязан показывать
 * ≈50% и не может пройти вердикт `valid`. Если проходит — ошибка в
 * методологии аудита (перекрытие наблюдений, look-ahead, смещение исходов).
 *
 * Опционально добавляется ШУМ НАБЛЮДЕНИЯ (noiseFraction × σ на каждую
 * котировку внутри минуты, независимо от истинной цены): наблюдаемые
 * close/high/low «дребезжат» вокруг истинной цены, как при bid/ask-bounce.
 * Возвраты наблюдаемых close получают отрицательную автокорреляцию
 * (≈ −n²/(1+2n²) для n = noiseFraction) при нулевой реальной
 * предсказуемости — так в отсутствие какого-либо эджа продолжения
 * движения (continuation) статистически проигрывают 50%.
 *
 * Волатильность кластеризуется (лог-AR(1)), чтобы детекторы, привязанные к
 * ATR/сжатию, срабатывали на данных так же часто, как на реальных.
 */
export interface RandomWalkOptions {
  bars: number;
  seed: number;
  /** Доля σ: шум наблюдения (0 — чистое блуждание). По умолчанию 0. */
  noiseFraction?: number;
  /** Кластеризация волатильности. По умолчанию true. */
  volatilityClustering?: boolean;
  /** Начальная цена. По умолчанию 1.1. */
  startPrice?: number;
  /** Шаг цены (округление котировок → появляются «ничьи»). По умолчанию 0.00001. */
  tick?: number;
  /** σ одной минуты в единицах цены. По умолчанию 0.0001. */
  sigma?: number;
  /** Unix-секунды первого бара. По умолчанию 1_780_000_000. */
  startTime?: number;
  /** Длина бара в секундах. По умолчанию 60. */
  barSeconds?: number;
}

/** Детерминированный PRNG (mulberry32). */
export function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gauss(rand: () => number): number {
  const u = Math.max(rand(), 1e-12);
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

const SUB_TICKS = 12;

export function generateRandomWalk(opts: RandomWalkOptions): Candle[] {
  const {
    bars,
    seed,
    noiseFraction = 0,
    volatilityClustering = true,
    startPrice = 1.1,
    tick = 0.00001,
    sigma = 0.0001,
    startTime = 1_780_000_000,
    barSeconds = 60,
  } = opts;

  const rand = mulberry32(seed);
  const quantize = (x: number) => Math.round(x / tick) * tick;
  const out: Candle[] = [];
  let price = startPrice;
  let logVol = 0;
  let time = startTime;

  for (let i = 0; i < bars; i++) {
    if (volatilityClustering) logVol = 0.985 * logVol + 0.18 * gauss(rand);
    const barSigma = sigma * Math.exp(logVol - 0.05);

    const observe = () => quantize(price + noiseFraction * sigma * gauss(rand));
    const first = observe();
    let high = first;
    let low = first;
    let last = first;
    for (let k = 0; k < SUB_TICKS; k++) {
      price += (barSigma / Math.sqrt(SUB_TICKS)) * gauss(rand);
      const obs = observe();
      if (obs > high) high = obs;
      if (obs < low) low = obs;
      last = obs;
    }
    out.push({ time, open: first, high, low, close: last, volume: 0 });
    time += barSeconds;
  }
  return out;
}
