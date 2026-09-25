import type {
  Candle,
  IndicatorConfig,
  FeatureName,
  Signal,
  Timeframe,
  Tick,
  Snapshot,
} from '@/types/domain';
import type { CalibrationModel } from '@/decision/calibration-model';
import { buildFullSnapshot } from '@/compute/full-snapshot';
import { buildSignal, type BuildSignalParams } from '@/decision/signal-builder';
import { isCrypto } from '@/data/symbols';

export interface EngineInput {
  symbolId: string;
  timeframe: Timeframe;
  candles: Candle[];
  config: IndicatorConfig;
  activeFeatures: FeatureName[];
  calibration: CalibrationModel | null;
  tick: Tick | null;
  barsToResolve: number;
}

export interface EngineOutput {
  signal: Signal | null;
  snapshot: Snapshot;
}

export function runEngine(input: EngineInput): EngineOutput {
  // D1: крипта торгуется 24/7 — не блокируем context-aware детекторы по
  // isAsiaOrClosed() (см. pattern-context.ts). Этот же путь используется и
  // backtest/simulator.ts (композитный бэктест через buildSignal), поэтому
  // фикс сразу покрывает и live-сигналы, и его backtest-эквивалент.
  const { snapshot } = buildFullSnapshot(input.candles, input.config, input.activeFeatures, true, isCrypto(input.symbolId));
  const signal = buildSignal({
    symbolId: input.symbolId,
    timeframe: input.timeframe,
    candles: input.candles,
    config: input.config,
    activeFeatures: input.activeFeatures,
    snapshot,
    calibration: input.calibration,
    tick: input.tick,
    barsToResolve: input.barsToResolve,
  } satisfies BuildSignalParams);
  return { signal, snapshot };
}
