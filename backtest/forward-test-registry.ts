/**
 * ПРЕДЗАДАННЫЙ форвард-тест (pre-registration) гипотезы «разворот после самой крупной свечи».
 *
 * Правила заморожены ДО просмотра форвард-данных. Менять поля ниже после старта форварда нельзя:
 * любая правка = новый id (v2) и новый форвард-период с нуля. Причина, по которой тест вообще нужен, и
 * все наблюдавшиеся до регистрации цифры — в docs/audit/FORWARD_TEST_REVERSAL_V1.md.
 *
 * Порядок:
 *   1. `calibrate` (один раз) → пороги силы по инструментам (99-й перцентиль тело/ATR на окне калибровки);
 *      вписать в `thresholds` и закоммитить ДО forwardStartUtc.
 *   2. `progress` — только число событий (без долей выигрыша: подглядывать нельзя).
 *   3. `evaluate` — ОДИН раз, когда событий ≥ minEvents. Вердикт pass/fail окончательный.
 */
export interface ForwardTestRule {
  id: string;
  registeredOn: string;
  hypothesis: string;
  timeframe: '1m';
  /** Единый пул: вердикт по ВСЕМ инструментам вместе (без выбора «лучшего»). */
  instruments: string[];
  atrPeriod: number;
  calibrationWindow: { from: string; to: string };
  strengthPercentile: number;
  /** Замороженные пороги силы (тело/ATR) по инструментам. null — ещё не откалибровано. */
  thresholds: Record<string, number | null>;
  /** Вход по open следующего бара против направления сигнальной свечи; исход — close через expiryBars баров. */
  entry: 'next-open';
  expiryBars: number;
  payoutPercent: number;
  /** События считаются, только если время сигнальной свечи ≥ этого момента (UTC). */
  forwardStartUtc: string;
  /** Минимум решённых событий (без ничьих) в пуле для единственного официального вердикта. */
  minEvents: number;
  /** Длина временного блока кластера для эффективного n, секунды (кластеры общие для всех инструментов). */
  clusterSeconds: number;
}

export const FORWARD_TEST_RULES: Record<string, ForwardTestRule> = {
  'reversal-top1pct-v1': {
    id: 'reversal-top1pct-v1',
    registeredOn: '2026-09-20',
    hypothesis:
      'После свечи 1m с телом/ATR(14) в верхнем 1% (порог — 99-й перцентиль окна калибровки) цена в следующую минуту чаще идёт против свечи; торговля против свечи с входом по open следующего бара выигрывает чаще безубытка при выплате 80% (55.56%).',
    timeframe: '1m',
    instruments: ['EURUSD', 'USDJPY', 'BTCUSDT', 'ETHUSDT'],
    atrPeriod: 14,
    calibrationWindow: { from: '2025-09-01', to: '2026-09-17' },
    strengthPercentile: 0.99,
    thresholds: { EURUSD: 2.7999999999979273, USDJPY: 2.9808612440192506, BTCUSDT: 3.3779262267042856, ETHUSDT: 3.0480535598790186 },
    entry: 'next-open',
    expiryBars: 1,
    payoutPercent: 80,
    forwardStartUtc: '2026-09-22T00:00:00Z',
    minEvents: 1600,
    clusterSeconds: 3600,
  },
};
