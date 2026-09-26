import type { Candle } from '@/types/domain';
import { isCrypto, isDerivSupported, mapSymbolForDeriv } from '@/data/symbols';
import { PROVIDERS_CONFIG } from '@/data/providers.config';
import { readPage, writePage } from './candle-cache';

const BINANCE_REST = 'https://api.binance.com';
// BUGFIX (промт "Исправление по воронке гейтов", продолжение — "как был
// реализован прогон истории"): раньше здесь был один захардкоженный
// DERIV_WS = 'wss://ws.derivws.com/websockets/v3?app_id=1089' — единая
// точка отказа. Фикс с fallback-хостами (Фаза 0, 7 падающих тестов
// connection-manager.test.ts/deriv.test.ts) применили только к live-
// подключению (src/data/sources/deriv.ts) — этот отдельный, самостоятельный
// загрузчик истории для аудита его не унаследовал.
//
// Не переиспользуем buildDerivWsUrls()/resolveDerivAppId() из
// providers.config.ts напрямую: resolveDerivAppId() читает
// `import.meta.env.VITE_DERIV_APP_ID`, а это Vite-специфичная подстановка,
// которой под `tsx` (см. package.json: "tsx --tsconfig ... backtest/*.ts")
// просто нет — `import.meta.env` там `undefined`, и обращение к
// `.VITE_DERIV_APP_ID` уронило бы весь прогон TypeError'ом ещё до первого
// запроса. Эта функция раньше в backtest-коде вообще не вызывалась, поэтому
// это было бы новым, непроверенным риском, а не воспроизведением уже
// работающего пути. PROVIDERS_CONFIG — обычный объект (`as const`), без
// побочных эффектов при импорте, поэтому список хостов из него безопасно
// переиспользовать напрямую, а app_id брать из process.env (Node-эквивалент
// import.meta.env.VITE_DERIV_APP_ID для CLI-скриптов) с фолбэком на дефолт.
function getDerivWsUrls(): string[] {
  const appId = encodeURIComponent(process.env.VITE_DERIV_APP_ID?.trim() || PROVIDERS_CONFIG.deriv.defaultAppId);
  const noAppId: readonly number[] = PROVIDERS_CONFIG.deriv.wsEndpointsNoAppId ?? [];
  return PROVIDERS_CONFIG.deriv.wsEndpoints.map((base, i) =>
    noAppId.includes(i) ? base : `${base}?app_id=${appId}`,
  );
}
// Deriv ticks_history accepts count up to 5000 — 5× more data per request
// than the previous 1000. Verified: the API does not silently truncate.
const MAX_PER_REQUEST = 5000;
const BINANCE_MAX_PER_REQUEST = 1000;
const REQUEST_TIMEOUT_MS = 15_000;
const DERIV_GRANULARITY = 60;
// Это аварийный предохранитель от зависшего цикла, НЕ ограничитель объёма
// данных — реальную остановку делают три легитимных условия ниже (reached
// start boundary / no progress / too many empty batches in a row). BUGFIX
// (v7, форекс-прогон 2026-03-01..2026-09-17): 200 оказалось туже, чем
// реальная потребность (~300+ итераций при среднем throughput ~958
// свечей/итерацию из-за частичных батчей на границах форекс-сессий),
// поэтому предохранитель срабатывал раньше легитимной остановки и молча
// обрезал историю. Подняли с большим запасом — это не magic number под
// текущий диапазон, а по-настоящему "это не должно происходить в принципе".
const MAX_DERIV_ITERATIONS = 3000;
const RETRY_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 500;

/**
 * Оборачивает одну сетевую попытку (одну страницу) в retry с экспоненциальной
 * паузой. До RETRY_ATTEMPTS попыток — таймаут/обрыв WS/5xx на одной странице
 * больше не роняет весь многочасовой прогон.
 */
async function fetchWithRetry<T>(fn: () => Promise<T>, attempts = RETRY_ATTEMPTS): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < attempts - 1) {
        const delayMs = RETRY_BASE_DELAY_MS * 2 ** attempt;
        console.log(`  [retry] attempt ${attempt + 1}/${attempts} failed (${err instanceof Error ? err.message : String(err)}), retrying in ${delayMs}ms`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }
  throw lastErr;
}

export interface LoadOptions {
  symbol: string;
  fromMs: number;
  toMs: number;
}

export interface LoadResult {
  candles: Candle[];
  truncatedByIterationCap: boolean;
}

export async function loadHistory(options: LoadOptions): Promise<LoadResult> {
  const { symbol } = options;
  if (isDerivSupported(symbol)) {
    return loadDerivHistory(options);
  }
  if (isCrypto(symbol)) {
    return { candles: await loadBinanceHistory(options), truncatedByIterationCap: false };
  }
  return loadDerivHistory(options);
}

async function loadBinanceHistory(options: LoadOptions): Promise<Candle[]> {
  const { symbol, fromMs, toMs } = options;
  const candles: Candle[] = [];
  let startTime = fromMs;
  let pagesFromCache = 0;
  let pagesFetched = 0;

  while (startTime < toMs) {
    let batch = await readPage('binance', symbol, startTime);
    if (batch) {
      pagesFromCache++;
    } else {
      batch = await fetchWithRetry(() => fetchBinanceBatch(symbol, startTime, toMs));
      await writePage('binance', symbol, startTime, batch);
      pagesFetched++;
    }
    if (batch.length === 0) break;

    for (const c of batch) {
      if (c.time * 1000 <= toMs) candles.push(c);
    }

    if (batch.length < BINANCE_MAX_PER_REQUEST) break;
    startTime = batch[batch.length - 1].time * 1000 + 60_000;
  }

  if (pagesFromCache > 0) {
    console.log(`  [Binance] ${symbol}: ${pagesFromCache} page(s) from disk cache, ${pagesFetched} fetched over network`);
  }
  return deduplicate(candles);
}

async function fetchBinanceBatch(symbol: string, startTime: number, endTime: number): Promise<Candle[]> {
  const url =
    `${BINANCE_REST}/api/v3/klines?symbol=${symbol}&interval=1m` +
    `&startTime=${startTime}&endTime=${endTime}&limit=${BINANCE_MAX_PER_REQUEST}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`Binance API ${res.status} ${res.statusText}`);
    const rows: unknown = await res.json();
    if (!Array.isArray(rows)) throw new Error('Binance API: unexpected response shape');
    return rows.map(parseKlineRow);
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('Binance API: request timeout');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function parseKlineRow(row: unknown): Candle {
  const r = row as (string | number)[];
  return {
    time: Math.floor(Number(r[0]) / 1000),
    open: parseFloat(String(r[1])),
    high: parseFloat(String(r[2])),
    low: parseFloat(String(r[3])),
    close: parseFloat(String(r[4])),
    volume: parseFloat(String(r[5])),
  };
}

export async function paginateDerivHistory(
  options: LoadOptions,
  fetchPage: (endTime: number) => Promise<{ batch: Candle[]; fromCache: boolean }>,
): Promise<{ candles: Candle[]; truncatedByIterationCap: boolean }> {
  const { fromMs, toMs } = options;
  const allCandles: Candle[] = [];
  let endTime = Math.floor(toMs / 1000);
  const startSec = Math.floor(fromMs / 1000);
  let iterations = 0;
  let prevEndTime = endTime + 1;
  let pagesFromCache = 0;
  let pagesFetched = 0;
  let truncatedByIterationCap = false;

  while (endTime > startSec && iterations < MAX_DERIV_ITERATIONS) {
    iterations++;
    const { batch, fromCache } = await fetchPage(endTime);
    if (fromCache) {
      pagesFromCache++;
    } else {
      pagesFetched++;
    }
    if (batch.length === 0) {
      console.log(`  [Deriv] stopping: empty batch at iteration ${iterations}`);
      break;
    }

    const oldest = batch[0].time;
    for (const c of batch) {
      if (c.time >= startSec && c.time <= endTime) allCandles.push(c);
    }

    if (oldest <= startSec) {
      console.log(`  [Deriv] stopping: reached start boundary at iteration ${iterations} (oldest=${oldest}, start=${startSec})`);
      break;
    }

    // No-progress guard: if oldest didn't move backward, we'd loop forever
    if (oldest >= prevEndTime) {
      console.log(`  [Deriv] stopping: no progress at iteration ${iterations} (oldest=${oldest} >= prevEndTime=${prevEndTime})`);
      break;
    }

    // Do NOT break on short batch — forex weekend gaps produce partial batches
    // mid-history. Only batch.length === 0 means we've exhausted the API.
    prevEndTime = endTime;
    endTime = oldest - 1;
  }

  if (iterations >= MAX_DERIV_ITERATIONS) {
    truncatedByIterationCap = true;
    console.log(`  [Deriv] stopping: hit iteration cap (${MAX_DERIV_ITERATIONS}) — history is INCOMPLETE, oldest fetched candle did not reach start boundary`);
  }

  console.log(`  [Deriv] finished after ${iterations} iterations, ${allCandles.length} candles (${pagesFromCache} page(s) from disk cache, ${pagesFetched} fetched over network)${truncatedByIterationCap ? ' [TRUNCATED]' : ''}`);
  return { candles: deduplicate(allCandles), truncatedByIterationCap };
}

async function loadDerivHistory(options: LoadOptions): Promise<LoadResult> {
  const { symbol } = options;
  const fetchPage = async (endTime: number): Promise<{ batch: Candle[]; fromCache: boolean }> => {
    const cached = await readPage('deriv', symbol, endTime);
    if (cached) {
      return { batch: cached, fromCache: true };
    }
    const batch = await fetchDerivBatchWithFallback(symbol, endTime);
    await writePage('deriv', symbol, endTime, batch);
    return { batch, fromCache: false };
  };
  const { candles, truncatedByIterationCap } = await paginateDerivHistory(options, fetchPage);
  return { candles, truncatedByIterationCap };
}

interface DerivPending {
  resolve: (data: Record<string, unknown>) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * D1/data-loader fix (см. комментарий у getDerivWsUrls выше): перебирает
 * список Deriv WS-хостов по порядку. Для каждого хоста сначала даётся его
 * собственный бюджет ретраев (fetchWithRetry — транзиентные обрывы/таймауты
 * на ОДНОМ хосте), и только если хост исчерпал все попытки — переходим к
 * следующему. Раньше при недоступности единственного хоста весь прогон
 * (часы скачивания истории) падал целиком.
 */
async function fetchDerivBatchWithFallback(symbol: string, endEpoch: number): Promise<Candle[]> {
  const urls = getDerivWsUrls();
  let lastErr: unknown;
  for (let i = 0; i < urls.length; i++) {
    try {
      return await fetchWithRetry(() => fetchDerivBatch(symbol, endEpoch, urls[i]));
    } catch (err) {
      lastErr = err;
      if (i < urls.length - 1) {
        console.log(`  [Deriv] host ${new URL(urls[i]).host} исчерпал попытки (${err instanceof Error ? err.message : String(err)}), пробуем следующий хост`);
      }
    }
  }
  throw lastErr;
}

async function fetchDerivBatch(symbol: string, endEpoch: number, wsUrl: string): Promise<Candle[]> {
  const derivSymbol = mapSymbolForDeriv(symbol);
  return new Promise<Candle[]>((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const pending = new Map<number, DerivPending>();
    let settled = false;

    const cleanup = () => {
      pending.forEach((p) => { clearTimeout(p.timer); });
      pending.clear();
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    };

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error('Deriv WS: request timeout'));
    }, REQUEST_TIMEOUT_MS);

    ws.onopen = () => {
      const reqId = 1;
      pending.set(reqId, {
        resolve: (data) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          const candlesRaw = data.candles as Array<Record<string, unknown>> | undefined;
          if (!Array.isArray(candlesRaw)) {
            reject(new Error('Deriv: unexpected history shape'));
            return;
          }
          const candles = candlesRaw.map((c) => ({
            time: Number(c.epoch),
            open: Number(c.open),
            high: Number(c.high),
            low: Number(c.low),
            close: Number(c.close),
            volume: 0,
          }));
          resolve(candles);
        },
        reject: (err) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          reject(err);
        },
        timer,
      });
      ws.send(JSON.stringify({
        ticks_history: derivSymbol,
        end: String(endEpoch),
        style: 'candles',
        granularity: DERIV_GRANULARITY,
        count: MAX_PER_REQUEST,
        req_id: 1,
      }));
    };

    ws.onmessage = (e) => {
      if (typeof e.data !== 'string') return;
      let data: unknown;
      try { data = JSON.parse(e.data); } catch { return; }
      if (!data || typeof data !== 'object') return;
      const msg = data as Record<string, unknown>;
      const reqId = typeof msg.req_id === 'number' ? msg.req_id : (typeof msg.req_id === 'string' ? Number(msg.req_id) : undefined);
      if (reqId && pending.has(reqId)) {
        const p = pending.get(reqId)!;
        pending.delete(reqId);
        if (msg.error) {
          const errMessage = (msg.error as Record<string, unknown>).message;
          p.reject(new Error(typeof errMessage === 'string' ? errMessage : 'Deriv error'));
        } else {
          p.resolve(msg);
        }
      }
    };

    ws.onerror = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error('Deriv WS: connection failed'));
    };

    ws.onclose = () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(new Error('Deriv WS: connection closed unexpectedly'));
      }
    };
  });
}

function deduplicate(candles: Candle[]): Candle[] {
  const seen = new Set<number>();
  const result: Candle[] = [];
  for (const c of candles) {
    if (!seen.has(c.time)) {
      seen.add(c.time);
      result.push(c);
    }
  }
  return result.sort((a, b) => a.time - b.time);
}
