// АВТОГЕНЕРИРОВАНО — не редактировать руками.
// Генератор: backtest/generate-pattern-horizon-table.ts
// Перегенерация: npm run backtest:gen-horizon-table
// Сверка в CI:  npm run backtest:gen-horizon-table -- --check
//
// Источники: BTCUSDT-ETHUSDT-SOLUSDT-BNBUSDT-1m-walkforward-2026-03-01-2026-09-17, EURUSD-GBPUSD-USDJPY-AUDUSD-1m-walkforward-2026-03-01-2026-09-17
import type { AssetClass } from '@/types/domain';

export interface PatternHorizonEntry {
  /** Лучший горизонт в барах, выбранный ТОЛЬКО по train/validation. */
  expiryBars: number;
  /** Точность на отложенных test-наблюдениях. */
  accuracy: number;
  testCount: number;
  pValue: number | null;
  significant: boolean;
  passesWilsonGate: boolean;
  sourceRun: string;
}

/**
 * 'valid'       — значимо лучше случайного + Wilson pass → берём expiryBars.
 * 'rejected'    — значимо ХУЖЕ случайного → signal-builder подавляет сигнал.
 * 'no-evidence' — отличие не установлено (или не прошло Wilson) → fallback,
 *                 сигнал НЕ подавляется. Отсутствие записи эквивалентно.
 */
export type PatternHorizonStatus = 'valid' | 'rejected' | 'no-evidence';

export interface PatternHorizonRecord {
  entry: PatternHorizonEntry | null;
  status: PatternHorizonStatus;
  note?: string;
}

export type PatternHorizonTable = Record<AssetClass, Partial<Record<string, PatternHorizonRecord>>>;

export const PATTERN_HORIZON_TABLE: PatternHorizonTable = {
  crypto: {
    "consolidation-breakout": {
      entry: {
        expiryBars: 1,
        accuracy: 0.4696,
        testCount: 2579,
        pValue: 0.002121,
        significant: false,
        passesWilsonGate: false,
        sourceRun: "BTCUSDT-ETHUSDT-SOLUSDT-BNBUSDT-1m-walkforward-2026-03-01-2026-09-17",
      },
      status: "rejected",
      note: "significant below baseline (deduplicated)",
    },
    "fvg-breaker-block": {
      entry: {
        expiryBars: 5,
        accuracy: 0.4759,
        testCount: 1761,
        pValue: 0.04529,
        significant: false,
        passesWilsonGate: false,
        sourceRun: "BTCUSDT-ETHUSDT-SOLUSDT-BNBUSDT-1m-walkforward-2026-03-01-2026-09-17",
      },
      status: "rejected",
      note: "significant below baseline (deduplicated)",
    },
    "fvg-nested": {
      entry: {
        expiryBars: 5,
        accuracy: 0.473,
        testCount: 3300,
        pValue: 0.002057,
        significant: false,
        passesWilsonGate: false,
        sourceRun: "BTCUSDT-ETHUSDT-SOLUSDT-BNBUSDT-1m-walkforward-2026-03-01-2026-09-17",
      },
      status: "rejected",
      note: "significant below baseline (deduplicated)",
    },
    "fvg-return": {
      entry: {
        expiryBars: 1,
        accuracy: 0.4728,
        testCount: 6793,
        pValue: 0.00000797,
        significant: false,
        passesWilsonGate: false,
        sourceRun: "BTCUSDT-ETHUSDT-SOLUSDT-BNBUSDT-1m-walkforward-2026-03-01-2026-09-17",
      },
      status: "rejected",
      note: "significant below baseline (deduplicated)",
    },
    "harmonic-pattern": {
      entry: {
        expiryBars: 30,
        accuracy: 0.5212,
        testCount: 898,
        pValue: 0.2169,
        significant: false,
        passesWilsonGate: false,
        sourceRun: "BTCUSDT-ETHUSDT-SOLUSDT-BNBUSDT-1m-walkforward-2026-03-01-2026-09-17",
      },
      status: "no-evidence",
      note: "not distinguishable from baseline (deduplicated)",
    },
    "impulse-breakout": {
      entry: {
        expiryBars: 1,
        accuracy: 0.459,
        testCount: 9412,
        pValue: 1.842e-15,
        significant: false,
        passesWilsonGate: false,
        sourceRun: "BTCUSDT-ETHUSDT-SOLUSDT-BNBUSDT-1m-walkforward-2026-03-01-2026-09-17",
      },
      status: "rejected",
      note: "significant below baseline (deduplicated)",
    },
    "inside-bar": {
      entry: {
        expiryBars: 5,
        accuracy: 0.4912,
        testCount: 37015,
        pValue: 0.0007015,
        significant: false,
        passesWilsonGate: false,
        sourceRun: "BTCUSDT-ETHUSDT-SOLUSDT-BNBUSDT-1m-walkforward-2026-03-01-2026-09-17",
      },
      status: "rejected",
      note: "significant below baseline (deduplicated)",
    },
    "liquidity-sweep#reversal-at-key-level": {
      entry: {
        expiryBars: 1,
        accuracy: 0.5426,
        testCount: 317,
        pValue: 0.1441,
        significant: false,
        passesWilsonGate: false,
        sourceRun: "BTCUSDT-ETHUSDT-SOLUSDT-BNBUSDT-1m-walkforward-2026-03-01-2026-09-17",
      },
      status: "no-evidence",
      note: "not distinguishable from baseline (deduplicated)",
    },
    "marubozu-bearish": {
      entry: {
        expiryBars: 2,
        accuracy: 0.4823,
        testCount: 367,
        pValue: 0.5311,
        significant: false,
        passesWilsonGate: false,
        sourceRun: "BTCUSDT-ETHUSDT-SOLUSDT-BNBUSDT-1m-walkforward-2026-03-01-2026-09-17",
      },
      status: "no-evidence",
      note: "not distinguishable from baseline (deduplicated)",
    },
    "marubozu-bullish": {
      entry: {
        expiryBars: 1,
        accuracy: 0.4112,
        testCount: 428,
        pValue: 0.0002791,
        significant: false,
        passesWilsonGate: false,
        sourceRun: "BTCUSDT-ETHUSDT-SOLUSDT-BNBUSDT-1m-walkforward-2026-03-01-2026-09-17",
      },
      status: "rejected",
      note: "significant below baseline (deduplicated)",
    },
    "order-block-breaker": {
      entry: {
        expiryBars: 30,
        accuracy: 0.4677,
        testCount: 2555,
        pValue: 0.001172,
        significant: false,
        passesWilsonGate: false,
        sourceRun: "BTCUSDT-ETHUSDT-SOLUSDT-BNBUSDT-1m-walkforward-2026-03-01-2026-09-17",
      },
      status: "rejected",
      note: "significant below baseline (deduplicated)",
    },
    "order-block-continuation": {
      entry: {
        expiryBars: 10,
        accuracy: 0.4824,
        testCount: 4044,
        pValue: 0.02659,
        significant: false,
        passesWilsonGate: false,
        sourceRun: "BTCUSDT-ETHUSDT-SOLUSDT-BNBUSDT-1m-walkforward-2026-03-01-2026-09-17",
      },
      status: "rejected",
      note: "significant below baseline (deduplicated)",
    },
    "order-block-nested": {
      entry: {
        expiryBars: 30,
        accuracy: 0.4771,
        testCount: 895,
        pValue: 0.1812,
        significant: false,
        passesWilsonGate: false,
        sourceRun: "BTCUSDT-ETHUSDT-SOLUSDT-BNBUSDT-1m-walkforward-2026-03-01-2026-09-17",
      },
      status: "no-evidence",
      note: "not distinguishable from baseline (deduplicated)",
    },
    "pin-bar": {
      entry: {
        expiryBars: 1,
        accuracy: 0.4361,
        testCount: 305,
        pValue: 0.0294,
        significant: false,
        passesWilsonGate: false,
        sourceRun: "BTCUSDT-ETHUSDT-SOLUSDT-BNBUSDT-1m-walkforward-2026-03-01-2026-09-17",
      },
      status: "rejected",
      note: "significant below baseline (deduplicated)",
    },
    "shooting-star": {
      entry: {
        expiryBars: 3,
        accuracy: 0.512,
        testCount: 1082,
        pValue: 0.4473,
        significant: false,
        passesWilsonGate: false,
        sourceRun: "BTCUSDT-ETHUSDT-SOLUSDT-BNBUSDT-1m-walkforward-2026-03-01-2026-09-17",
      },
      status: "no-evidence",
      note: "not distinguishable from baseline (deduplicated)",
    },
    "strong-order-block-reaction": {
      entry: {
        expiryBars: 1,
        accuracy: 0.4928,
        testCount: 5893,
        pValue: 0.2739,
        significant: false,
        passesWilsonGate: false,
        sourceRun: "BTCUSDT-ETHUSDT-SOLUSDT-BNBUSDT-1m-walkforward-2026-03-01-2026-09-17",
      },
      status: "no-evidence",
      note: "not distinguishable from baseline (deduplicated)",
    },
  },
  forex: {
    "consolidation-breakout": {
      entry: {
        expiryBars: 2,
        accuracy: 0.4537,
        testCount: 1664,
        pValue: 0.0001746,
        significant: false,
        passesWilsonGate: false,
        sourceRun: "EURUSD-GBPUSD-USDJPY-AUDUSD-1m-walkforward-2026-03-01-2026-09-17",
      },
      status: "rejected",
      note: "significant below baseline (deduplicated)",
    },
    "fvg-breaker-block": {
      entry: {
        expiryBars: 5,
        accuracy: 0.4838,
        testCount: 1294,
        pValue: 0.2544,
        significant: false,
        passesWilsonGate: false,
        sourceRun: "EURUSD-GBPUSD-USDJPY-AUDUSD-1m-walkforward-2026-03-01-2026-09-17",
      },
      status: "no-evidence",
      note: "not distinguishable from baseline (deduplicated)",
    },
    "fvg-nested": {
      entry: {
        expiryBars: 20,
        accuracy: 0.4896,
        testCount: 2157,
        pValue: 0.3434,
        significant: false,
        passesWilsonGate: false,
        sourceRun: "EURUSD-GBPUSD-USDJPY-AUDUSD-1m-walkforward-2026-03-01-2026-09-17",
      },
      status: "no-evidence",
      note: "not distinguishable from baseline (deduplicated)",
    },
    "fvg-return": {
      entry: {
        expiryBars: 1,
        accuracy: 0.4867,
        testCount: 5346,
        pValue: 0.05379,
        significant: false,
        passesWilsonGate: false,
        sourceRun: "EURUSD-GBPUSD-USDJPY-AUDUSD-1m-walkforward-2026-03-01-2026-09-17",
      },
      status: "no-evidence",
      note: "not distinguishable from baseline (deduplicated)",
    },
    "harmonic-pattern": {
      entry: {
        expiryBars: 30,
        accuracy: 0.4725,
        testCount: 618,
        pValue: 0.1843,
        significant: false,
        passesWilsonGate: false,
        sourceRun: "EURUSD-GBPUSD-USDJPY-AUDUSD-1m-walkforward-2026-03-01-2026-09-17",
      },
      status: "no-evidence",
      note: "not distinguishable from baseline (deduplicated)",
    },
    "impulse-breakout": {
      entry: {
        expiryBars: 3,
        accuracy: 0.4548,
        testCount: 9637,
        pValue: 7.427e-19,
        significant: false,
        passesWilsonGate: false,
        sourceRun: "EURUSD-GBPUSD-USDJPY-AUDUSD-1m-walkforward-2026-03-01-2026-09-17",
      },
      status: "rejected",
      note: "significant below baseline (deduplicated)",
    },
    "inside-bar": {
      entry: {
        expiryBars: 5,
        accuracy: 0.4841,
        testCount: 28158,
        pValue: 1.026e-7,
        significant: false,
        passesWilsonGate: false,
        sourceRun: "EURUSD-GBPUSD-USDJPY-AUDUSD-1m-walkforward-2026-03-01-2026-09-17",
      },
      status: "rejected",
      note: "significant below baseline (deduplicated)",
    },
    "liquidity-sweep#reversal-at-key-level": {
      entry: {
        expiryBars: 3,
        accuracy: 0.5337,
        testCount: 208,
        pValue: 0.3674,
        significant: false,
        passesWilsonGate: false,
        sourceRun: "EURUSD-GBPUSD-USDJPY-AUDUSD-1m-walkforward-2026-03-01-2026-09-17",
      },
      status: "no-evidence",
      note: "not distinguishable from baseline (deduplicated)",
    },
    "marubozu-bearish": {
      entry: {
        expiryBars: 1,
        accuracy: 0.4636,
        testCount: 330,
        pValue: 0.2054,
        significant: false,
        passesWilsonGate: false,
        sourceRun: "EURUSD-GBPUSD-USDJPY-AUDUSD-1m-walkforward-2026-03-01-2026-09-17",
      },
      status: "no-evidence",
      note: "not distinguishable from baseline (deduplicated)",
    },
    "marubozu-bullish": {
      entry: {
        expiryBars: 2,
        accuracy: 0.4758,
        testCount: 372,
        pValue: 0.3781,
        significant: false,
        passesWilsonGate: false,
        sourceRun: "EURUSD-GBPUSD-USDJPY-AUDUSD-1m-walkforward-2026-03-01-2026-09-17",
      },
      status: "no-evidence",
      note: "not distinguishable from baseline (deduplicated)",
    },
    "order-block-breaker": {
      entry: {
        expiryBars: 5,
        accuracy: 0.49,
        testCount: 2190,
        pValue: 0.3582,
        significant: false,
        passesWilsonGate: false,
        sourceRun: "EURUSD-GBPUSD-USDJPY-AUDUSD-1m-walkforward-2026-03-01-2026-09-17",
      },
      status: "no-evidence",
      note: "not distinguishable from baseline (deduplicated)",
    },
    "order-block-continuation": {
      entry: {
        expiryBars: 30,
        accuracy: 0.4851,
        testCount: 2793,
        pValue: 0.1207,
        significant: false,
        passesWilsonGate: false,
        sourceRun: "EURUSD-GBPUSD-USDJPY-AUDUSD-1m-walkforward-2026-03-01-2026-09-17",
      },
      status: "no-evidence",
      note: "not distinguishable from baseline (deduplicated)",
    },
    "order-block-nested": {
      entry: {
        expiryBars: 20,
        accuracy: 0.4914,
        testCount: 759,
        pValue: 0.6632,
        significant: false,
        passesWilsonGate: false,
        sourceRun: "EURUSD-GBPUSD-USDJPY-AUDUSD-1m-walkforward-2026-03-01-2026-09-17",
      },
      status: "no-evidence",
      note: "not distinguishable from baseline (deduplicated)",
    },
    "pin-bar": {
      entry: {
        expiryBars: 3,
        accuracy: 0.4687,
        testCount: 335,
        pValue: 0.2745,
        significant: false,
        passesWilsonGate: false,
        sourceRun: "EURUSD-GBPUSD-USDJPY-AUDUSD-1m-walkforward-2026-03-01-2026-09-17",
      },
      status: "no-evidence",
      note: "not distinguishable from baseline (deduplicated)",
    },
    "shooting-star": {
      entry: {
        expiryBars: 3,
        accuracy: 0.5096,
        testCount: 785,
        pValue: 0.6173,
        significant: false,
        passesWilsonGate: false,
        sourceRun: "EURUSD-GBPUSD-USDJPY-AUDUSD-1m-walkforward-2026-03-01-2026-09-17",
      },
      status: "no-evidence",
      note: "not distinguishable from baseline (deduplicated)",
    },
    "strong-order-block-reaction": {
      entry: {
        expiryBars: 10,
        accuracy: 0.5082,
        testCount: 5012,
        pValue: 0.2526,
        significant: false,
        passesWilsonGate: false,
        sourceRun: "EURUSD-GBPUSD-USDJPY-AUDUSD-1m-walkforward-2026-03-01-2026-09-17",
      },
      status: "no-evidence",
      note: "not distinguishable from baseline (deduplicated)",
    },
  },
};
