import type { Candle, PatternResult, SignalStrength, MarketStructure } from '@/types/domain';
import { lastNonNull, volumeRatio, hasReliableVolume } from '@/compute/indicators/helpers';
import { atr } from '@/compute/indicators/atr';
import type { SessionRegime } from '@/compute/session-regime';
import { sessionBoost, isAsiaOrClosed } from './pattern-context';

function strengthForConfidence(confidence: number): SignalStrength {
  if (confidence >= 0.75) return 'strong';
  if (confidence >= 0.5) return 'moderate';
  return 'weak';
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

const ENTRY_THRESHOLD = 0.6;
const MIN_VOLUME_RATIO = 1.5;

// Consolidation breakout: narrow-range period (squeeze < 0.7x ATR) followed
// by a breakout candle — see bolt-prompt-8-strategies-replacement.md
// Phase 4.2 ("Стратегия «Прорыв консолидации»").
export function detectConsolidationBreakout(
  candles: Candle[],
  structure?: MarketStructure,
  session?: SessionRegime,
  lookback: number = 10,
  atrPeriod: number = 14,
  // D1: см. PatternContext.sessionAgnostic в pattern-context.ts.
  sessionAgnostic?: boolean,
): PatternResult | null {
  if (candles.length < lookback + 1) return null;

  const atrArr = atr(candles, atrPeriod);
  const atrValue = lastNonNull(atrArr);
  if (atrValue === null || atrValue <= 0) return null;

  const consolidation = candles.slice(-lookback - 1, -1);
  const ranges = consolidation.map((c) => c.high - c.low);
  const avgRange = ranges.reduce((a, b) => a + b, 0) / ranges.length;

  if (avgRange > atrValue * 0.7) return null;

  const last = candles[candles.length - 1];
  const lastIdx = candles.length - 1;
  const lastRange = last.high - last.low;
  if (lastRange < avgRange * 1.5) return null;

  // Тело пробойного бара должно доминировать над его собственным
  // диапазоном (фильтр против доджи/спиннинг-топов).
  const body = Math.abs(last.close - last.open);
  if (body < lastRange * 0.6) return null;

  const consolidationHigh = Math.max(...consolidation.map((c) => c.high));
  const consolidationLow = Math.min(...consolidation.map((c) => c.low));

  let direction: 'buy' | 'sell' | null = null;
  if (last.close > consolidationHigh) direction = 'buy';
  else if (last.close < consolidationLow) direction = 'sell';
  if (direction === null) return null;

  // Объёмный фильтр. BUGFIX (сверка 2026-09-19 по 6,5-месячному прогону):
  // раньше это был безусловный hard-block `if (volRatio < 1.5) return null`.
  // На Deriv/форекс-фидах volume всегда 0 → averageVolume()=0 →
  // volumeRatio() возвращает нейтральную заглушку 1, которая всегда < 1.5 —
  // детектор не мог сработать НИ РАЗУ на данных без реального объёма,
  // независимо от силы самого пробоя (тот же класс бага, что был в
  // impulse-breakout.ts — см. комментарий там). hasReliableVolume()
  // отличает «объёма в окне нет вообще» от «объём есть и он средний»:
  // фильтр применяется только когда есть на что опереться.
  const volumeReliable = hasReliableVolume(candles, lastIdx, 20);
  const volRatio = volumeReliable ? volumeRatio(candles, lastIdx, 20) : null;
  if (volumeReliable && volRatio! < MIN_VOLUME_RATIO) return null;

  let confidence = clamp01(lastRange / (avgRange * 2));

  if (session) {
    if (isAsiaOrClosed(session, sessionAgnostic)) confidence *= 0.6;
    else confidence *= sessionBoost(session);
  }

  if (structure && !(structure.bos && structure.trend === (direction === 'buy' ? 'up' : 'down'))) {
    confidence *= 0.7;
  }

  confidence = clamp01(confidence);
  if (confidence < ENTRY_THRESHOLD) return null;

  return {
    name: 'consolidation-breakout',
    direction,
    confidence,
    strength: strengthForConfidence(confidence),
    time: last.time,
    // Честно, а не безусловный true — как и в impulse-breakout.ts: бонус
    // за подтверждённый объём (+0.1 в applyConfidenceHierarchy()) не должен
    // начисляться, когда фильтр был просто пропущен из-за отсутствия
    // данных, а не пройден по факту.
    volumeConfirmed: volumeReliable,
  };
}
