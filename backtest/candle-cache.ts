/**
 * Постраничный дисковый кэш "сырых" свечей, полученных от Binance/Deriv.
 *
 * Проблема, которую это решает: loadBinanceHistory()/loadDerivHistory()
 * делают десятки-сотни последовательных сетевых запросов ("страниц") на
 * один символ для многомесячного диапазона. Раньше все страницы копились
 * только в памяти процесса и возвращались одним куском в конце функции —
 * обрыв соединения на любой странице (таймаут WebContainer, сон вкладки,
 * разрыв WebSocket) терял вообще всё скачанное, и повторный запуск начинал
 * докачку с нуля.
 *
 * Здесь каждая страница — детерминированная функция (source, symbol, курсор
 * пагинации) — кэшируется на диск сразу после получения. Повторный вызов
 * loadHistory() на том же диапазоне докачивает только страницы, которых нет
 * на диске, а не весь диапазон заново.
 *
 * Курсор пагинации:
 *  - Binance идёт вперёд по времени → курсор = startTime запроса (мс).
 *  - Deriv идёт назад по времени (запрашивает "count свечей до endEpoch") →
 *    курсор = endEpoch запроса (сек).
 * Обе величины детерминированно определяют содержимое страницы при фиксированном
 * диапазоне [fromMs, toMs] прогона, поэтому кэш безопасен для исторических
 * (не "живых") данных.
 */
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import type { Candle } from '@/types/domain';

const CANDLE_CACHE_DIR = 'backtest/.candle-cache';
const PAGE_CACHE_VERSION = 1;

export type CandleSource = 'binance' | 'deriv';

interface PageEnvelope {
  version: number;
  candles: Candle[];
}

function pagePath(source: CandleSource, symbol: string, cursor: number): string {
  return join(CANDLE_CACHE_DIR, source, symbol, `${cursor}.json`);
}

/** Возвращает кэшированную страницу или null, если её нет / она повреждена / устарела по версии. */
export async function readPage(
  source: CandleSource,
  symbol: string,
  cursor: number,
): Promise<Candle[] | null> {
  try {
    const raw = await readFile(pagePath(source, symbol, cursor), 'utf-8');
    const envelope = JSON.parse(raw) as PageEnvelope;
    if (envelope.version !== PAGE_CACHE_VERSION) return null;
    if (!Array.isArray(envelope.candles)) return null;
    return envelope.candles;
  } catch {
    return null;
  }
}

/** Атомарно записывает страницу на диск (tmp + rename — обрыв не оставляет частично записанный файл). */
export async function writePage(
  source: CandleSource,
  symbol: string,
  cursor: number,
  candles: Candle[],
): Promise<void> {
  const path = pagePath(source, symbol, cursor);
  const tmp = `${path}.tmp`;
  const envelope: PageEnvelope = { version: PAGE_CACHE_VERSION, candles };
  await mkdir(dirname(path), { recursive: true });
  await writeFile(tmp, JSON.stringify(envelope), 'utf-8');
  await rename(tmp, path);
}

export { PAGE_CACHE_VERSION, CANDLE_CACHE_DIR };
