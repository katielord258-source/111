import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../server-clock', () => ({
  serverClock: { now: () => Date.now() },
}));

const PRIMARY_URL = 'wss://primary.mock/websockets/v3?app_id=test';
const FALLBACK_URL = 'wss://fallback.mock/websockets/v3?app_id=test';

vi.mock('../providers.config', () => ({
  buildDerivWsUrls: () => [
    'wss://primary.mock/websockets/v3?app_id=test',
    'wss://fallback.mock/websockets/v3?app_id=test',
  ],
  PROVIDERS_CONFIG: {
    deriv: {
      connectTimeoutMs: 6000,
      appId: 'test',
      granularityMap: { '1m': 60, '5m': 300, '15m': 900, '30m': 1800, '1h': 3600, '4h': 14400, '1d': 86400 },
      reconnectBackoffMs: [3000, 6000, 12000, 30000, 60000],
      pingIntervalMs: 15000,
      requestTimeoutMs: 10000,
      defaultHistory: 1000,
    },
  },
}));

vi.mock('../symbols', () => ({
  mapSymbolForDeriv: (s: string) => s,
}));

vi.mock('@/lib/sentry', () => ({
  captureError: vi.fn(),
}));

vi.mock('../candle-validation', () => ({
  isValidCandle: (c: { time: number; open: number; high: number; low: number; close: number }) =>
    c && c.time > 0 && c.open > 0 && c.high > 0 && c.low > 0 && c.close > 0,
  filterValidCandles: (candles: unknown[]) => candles.filter((c: any) =>
    c && c.time > 0 && c.open > 0 && c.high > 0 && c.low > 0 && c.close > 0),
}));

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  static last(): MockWebSocket { return MockWebSocket.instances[MockWebSocket.instances.length - 1]; }

  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  readonly CONNECTING = 0;
  readonly OPEN = 1;
  readonly CLOSING = 2;
  readonly CLOSED = 3;

  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: ((ev: { code: number }) => void) | null = null;
  sent: string[] = [];

  constructor(public url: string) {
    MockWebSocket.instances.push(this);
  }

  addEventListener(event: string, cb: (ev: { code?: number }) => void) {
    if (event === 'open') this.onopen = cb as () => void;
    if (event === 'error') this.onerror = cb as () => void;
    if (event === 'close') this.onclose = cb;
  }

  removeEventListener() {}

  send(data: string) { this.sent.push(data); }

  close() { this.readyState = 3; this.onclose?.({ code: 1006 }); }

  fireOpen() { this.readyState = 1; this.onopen?.(); }

  fireError() { this.onerror?.(); }

  fireMessage(obj: Record<string, unknown>) {
    this.onmessage?.({ data: JSON.stringify(obj) });
  }
}

global.WebSocket = MockWebSocket as unknown as typeof WebSocket;

import { DerivSource, _resetLastSuccessfulHost } from './deriv';

describe('DerivSource fallback polling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    MockWebSocket.instances = [];
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function flushMicrotasks(times = 10): Promise<void> {
    for (let i = 0; i < times; i++) await Promise.resolve();
  }

  it('invokes fetchHistory via fallback polling once the stream goes stale', async () => {
    const source = new DerivSource();
    const fetchSpy = vi.spyOn(source, 'fetchHistory').mockResolvedValue([
      { time: 100, open: 1, high: 2, low: 0.5, close: 1.5, volume: 0 },
    ]);

    const connectPromise = source.connect('R_100', '1m');
    const ws = MockWebSocket.last();
    ws.fireOpen();

    await flushMicrotasks();
    ws.fireMessage({ req_id: 1 });
    await flushMicrotasks();
    ws.fireMessage({ req_id: 2 });
    await flushMicrotasks();

    await connectPromise;

    const initialCalls = fetchSpy.mock.calls.length;

    vi.advanceTimersByTime(10_000);

    expect(fetchSpy.mock.calls.length).toBeGreaterThan(initialCalls);

    source.disconnect();
  });

  it('does not poll while the WS stream is healthy (recent tick/ohlc message received)', async () => {
    const source = new DerivSource();
    const fetchSpy = vi.spyOn(source, 'fetchHistory').mockResolvedValue([
      { time: 100, open: 1, high: 2, low: 0.5, close: 1.5, volume: 0 },
    ]);

    const connectPromise = source.connect('R_100', '1m');
    const ws = MockWebSocket.last();
    ws.fireOpen();

    await flushMicrotasks();
    ws.fireMessage({ req_id: 1 });
    await flushMicrotasks();
    ws.fireMessage({ req_id: 2 });
    await flushMicrotasks();

    await connectPromise;

    const initialCalls = fetchSpy.mock.calls.length;

    for (let i = 0; i < 8; i++) {
      vi.advanceTimersByTime(1_000);
      ws.fireMessage({ ohlc: { open_time: 100, open: 1, high: 2, low: 0.5, close: 1.6 } });
    }

    expect(fetchSpy.mock.calls.length).toBe(initialCalls);

    source.disconnect();
  });

  it('resumes polling once the stream goes stale (no messages for a while)', async () => {
    const source = new DerivSource();
    const fetchSpy = vi.spyOn(source, 'fetchHistory').mockResolvedValue([
      { time: 100, open: 1, high: 2, low: 0.5, close: 1.5, volume: 0 },
    ]);

    const connectPromise = source.connect('R_100', '1m');
    const ws = MockWebSocket.last();
    ws.fireOpen();
    await flushMicrotasks();
    ws.fireMessage({ req_id: 1 });
    await flushMicrotasks();
    ws.fireMessage({ req_id: 2 });
    await flushMicrotasks();
    await connectPromise;

    const initialCalls = fetchSpy.mock.calls.length;

    vi.advanceTimersByTime(9_000);

    expect(fetchSpy.mock.calls.length).toBeGreaterThan(initialCalls);

    source.disconnect();
  });
});

describe('DerivSource endpoint fallback', () => {
  const HISTORY = [{ time: 100, open: 1, high: 2, low: 0.5, close: 1.5, volume: 0 }];

  beforeEach(() => {
    vi.useFakeTimers();
    MockWebSocket.instances = [];
    _resetLastSuccessfulHost();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function flushMicrotasks(times = 20): Promise<void> {
    for (let i = 0; i < times; i++) await Promise.resolve();
  }

  async function answerRequests(ws: MockWebSocket, rounds = 6): Promise<void> {
    const answered = new Set<number>();
    for (let i = 0; i < rounds; i++) {
      await flushMicrotasks();
      for (const raw of ws.sent) {
        const { req_id } = JSON.parse(raw) as { req_id?: number };
        if (req_id !== undefined && !answered.has(req_id)) {
          answered.add(req_id);
          ws.fireMessage({ req_id });
        }
      }
    }
  }

  const urls = () => MockWebSocket.instances.map((w) => w.url);

  function makeSource(): DerivSource {
    const source = new DerivSource();
    vi.spyOn(source, 'fetchHistory').mockResolvedValue(HISTORY);
    return source;
  }

  it('tries the primary endpoint first and does not touch the fallback when it works', async () => {
    const source = makeSource();
    const connectPromise = source.connect('EURUSD', '1m');

    expect(urls()).toEqual([PRIMARY_URL]);
    const ws = MockWebSocket.last();
    ws.fireOpen();
    await answerRequests(ws);
    const result = await connectPromise;

    expect(result.source).toBe('deriv');
    expect(urls()).toEqual([PRIMARY_URL]);
    source.disconnect();
  });

  it('switches to the fallback endpoint when the primary errors out', async () => {
    const source = makeSource();
    const connectPromise = source.connect('EURUSD', '1m');

    MockWebSocket.instances[0].fireError();
    await flushMicrotasks();
    expect(urls()).toEqual([PRIMARY_URL, FALLBACK_URL]);

    const ws = MockWebSocket.last();
    ws.fireOpen();
    await answerRequests(ws);
    await expect(connectPromise).resolves.toMatchObject({ source: 'deriv' });
    source.disconnect();
  });

  it('switches to the fallback when the primary closes before opening', async () => {
    const source = makeSource();
    const connectPromise = source.connect('EURUSD', '1m');

    MockWebSocket.instances[0].close();
    await flushMicrotasks();
    expect(urls()).toEqual([PRIMARY_URL, FALLBACK_URL]);

    const ws = MockWebSocket.last();
    ws.fireOpen();
    await answerRequests(ws);
    await expect(connectPromise).resolves.toMatchObject({ source: 'deriv' });
    source.disconnect();
  });

  it('switches to the fallback when the primary hangs past connectTimeoutMs', async () => {
    const source = makeSource();
    const connectPromise = source.connect('EURUSD', '1m');

    vi.advanceTimersByTime(5_999);
    await flushMicrotasks();
    expect(urls()).toEqual([PRIMARY_URL]);

    vi.advanceTimersByTime(1);
    await flushMicrotasks();
    expect(urls()).toEqual([PRIMARY_URL, FALLBACK_URL]);
    expect(MockWebSocket.instances[0].readyState).toBe(3);

    const ws = MockWebSocket.last();
    ws.fireOpen();
    await answerRequests(ws);
    await expect(connectPromise).resolves.toMatchObject({ source: 'deriv' });
    source.disconnect();
  });

  it('rejects with a message naming both hosts when every endpoint is down', async () => {
    const source = makeSource();
    const connectPromise = source.connect('EURUSD', '1m');
    const assertion = expect(connectPromise).rejects.toThrow(/all endpoints unreachable.*primary\.mock.*fallback\.mock/);

    MockWebSocket.instances[0].fireError();
    await flushMicrotasks();
    MockWebSocket.instances[1].fireError();
    await flushMicrotasks();
    await assertion;

    const created = MockWebSocket.instances.length;
    vi.advanceTimersByTime(120_000);
    await flushMicrotasks();
    expect(MockWebSocket.instances.length).toBe(created);
  });

  it('cleans up (closes the socket, no reconnect) when connect() fails after the socket opened', async () => {
    const source = new DerivSource();
    vi.spyOn(source, 'fetchHistory').mockRejectedValue(new Error('history down'));
    const connectPromise = source.connect('EURUSD', '1m');
    const assertion = expect(connectPromise).rejects.toThrow(/history down/);

    const ws = MockWebSocket.last();
    ws.fireOpen();
    await flushMicrotasks();

    // Primary history fails → fallback endpoint is tried. Fire its error
    // so connectWithFallback exhausts all endpoints and rejects.
    MockWebSocket.instances[1].fireError();
    await flushMicrotasks();
    await assertion;

    expect(ws.readyState).toBe(3);
    vi.advanceTimersByTime(120_000);
    await flushMicrotasks();
    expect(urls()).toEqual([PRIMARY_URL, FALLBACK_URL]);
  });

  it('reconnects from the last successful host first (not stuck on the fallback)', async () => {
    // After a successful fallback connection, lastSuccessfulHost is cached.
    // Reconnects try that host first, then fall through to the other.
    const source = makeSource();
    const connectPromise = source.connect('EURUSD', '1m');

    MockWebSocket.instances[0].fireError();
    await flushMicrotasks();
    const wsFallback = MockWebSocket.last();
    wsFallback.fireOpen();
    await answerRequests(wsFallback);
    await connectPromise;
    expect(urls()).toEqual([PRIMARY_URL, FALLBACK_URL]);

    wsFallback.close();
    vi.advanceTimersByTime(3_000);
    await flushMicrotasks();
    // Reconnect starts from the cached fallback host first.
    expect(urls()).toEqual([PRIMARY_URL, FALLBACK_URL, FALLBACK_URL]);

    MockWebSocket.instances[2].fireError();
    await flushMicrotasks();
    expect(urls()).toEqual([PRIMARY_URL, FALLBACK_URL, FALLBACK_URL, PRIMARY_URL]);

    source.disconnect();
  });

  it('a stale socket closing after being replaced does not trigger a spurious reconnect', async () => {
    const source = makeSource();
    const connectPromise = source.connect('EURUSD', '1m');
    const ws1 = MockWebSocket.last();
    ws1.fireOpen();
    await answerRequests(ws1);
    await connectPromise;

    ws1.close();
    vi.advanceTimersByTime(3_000);
    await flushMicrotasks();
    const ws2 = MockWebSocket.last();
    expect(ws2).not.toBe(ws1);
    ws2.fireOpen();
    await answerRequests(ws2);

    const statuses: string[] = [];
    const unsubscribe = source.onStatus((st) => statuses.push(st));
    statuses.length = 0;

    ws1.onclose?.({ code: 1006 });
    await flushMicrotasks();
    expect(statuses).toEqual([]);

    unsubscribe();
    source.disconnect();
  });

  it('disconnect() while connecting cancels the attempt and does not fall through to the next endpoint', async () => {
    const source = makeSource();
    const connectPromise = source.connect('EURUSD', '1m');
    const assertion = expect(connectPromise).rejects.toThrow('disconnected');

    source.disconnect();
    await flushMicrotasks();
    await assertion;

    expect(urls()).toEqual([PRIMARY_URL]);
    expect(MockWebSocket.instances[0].readyState).toBe(3);
  });

  it('switches to the fallback when the primary opens but ticks_history returns an error', async () => {
    const source = new DerivSource();
    // Primary: history fails with a Deriv error. Fallback: history succeeds.
    let callCount = 0;
    vi.spyOn(source, 'fetchHistory').mockImplementation(() => {
      callCount++;
      if (callCount === 1) return Promise.reject(new Error('InvalidSymbol'));
      return Promise.resolve(HISTORY);
    });

    const connectPromise = source.connect('EURUSD', '1m');

    // Primary socket opens successfully.
    const wsPrimary = MockWebSocket.last();
    wsPrimary.fireOpen();
    await flushMicrotasks();

    // fetchHistory (call 1) rejects — should trigger fallback to next endpoint.
    await flushMicrotasks();
    expect(urls()).toEqual([PRIMARY_URL, FALLBACK_URL]);

    // Primary socket should be cleaned up.
    expect(wsPrimary.readyState).toBe(3);

    // Fallback socket opens and succeeds.
    const wsFallback = MockWebSocket.last();
    wsFallback.fireOpen();
    await answerRequests(wsFallback);
    await expect(connectPromise).resolves.toMatchObject({ source: 'deriv' });
    source.disconnect();
  });
});
