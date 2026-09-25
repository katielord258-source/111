import { describe, it, expect } from 'vitest';
import {
  recommendedExpiry,
  fallbackExpiry,
  isPatternHorizonRejected,
  assetClassOf,
  lookupPatternHorizon,
  patternHorizonKey,
} from './recommended-expiry';
import { PATTERN_HORIZON_TABLE } from './pattern-horizon-table';

// Пока на реальных данных нет ни одного `valid` (аудит схемы 2, 2026-09-20: valid=0 на обоих
// пулах), механику «valid → табличный горизонт» проверяем на ВРЕМЕННО подставленной записи,
// а не на содержимом сгенерированной таблицы. Так тест не превращается в тормоз перекалибровки.
type Rec = NonNullable<(typeof PATTERN_HORIZON_TABLE)['crypto'][string]>;
function withRecord<T>(ac: 'crypto' | 'forex', name: string, rec: Rec | undefined, fn: () => T): T {
  const table = PATTERN_HORIZON_TABLE[ac] as Record<string, Rec | undefined>;
  const prev = table[name];
  table[name] = rec;
  try { return fn(); } finally { table[name] = prev; }
}
const validHarmonic = (expiryBars = 30): Rec => ({
  entry: { expiryBars, accuracy: 0.6, testCount: 1000, pValue: 0.001, significant: true, passesWilsonGate: true, sourceRun: 'test-fixture' },
  status: 'valid',
});
const rejectedRec = (): Rec => ({
  entry: { expiryBars: 1, accuracy: 0.45, testCount: 5000, pValue: 0.0001, significant: false, passesWilsonGate: false, sourceRun: 'test-fixture' },
  status: 'rejected',
});
const noEvidenceRec = (): Rec => ({
  entry: { expiryBars: 1, accuracy: 0.5, testCount: 5000, pValue: 0.9, significant: false, passesWilsonGate: false, sourceRun: 'test-fixture' },
  status: 'no-evidence',
});

// ВНИМАНИЕ (DoD п.7): часть ожиданий ниже завязана на СГЕНЕРИРОВАННУЮ
// таблицу и обязана меняться вместе с ней после каждого нового прогона.
// Чтобы такие тесты не превращались в скрытый тормоз перекалибровки,
// табличные значения берутся из самой таблицы, а проверяется ПОВЕДЕНИЕ
// (валидный → табличный горизонт; rejected → подавление; no-evidence →
// fallback). Жёстко зашит только сам факт наличия хотя бы одной записи
// каждого статуса на текущих данных — если после перегенерации такой
// записи не останется, тест честно упадёт, и это нужный сигнал.

describe('assetClassOf', () => {
  it('распознаёт крипту и форекс', () => {
    expect(assetClassOf('BTCUSDT')).toBe('crypto');
    expect(assetClassOf('ETHUSDT')).toBe('crypto');
    expect(assetClassOf('EURUSD')).toBe('forex');
    expect(assetClassOf('USDJPY')).toBe('forex');
  });

  it('неизвестный символ трактуется как форекс (консервативно)', () => {
    expect(assetClassOf('UNKNOWN')).toBe('forex');
  });
});

describe('recommendedExpiry — fallback (паттерн неизвестен таблице)', () => {
  it('returns at least 1 timeframe for low volatility', () => {
    expect(recommendedExpiry(null, 'forex', '15m', 0.001, 100)).toBeGreaterThanOrEqual(900);
  });

  it('returns more bars for lower volatility', () => {
    const lowVol = recommendedExpiry(null, 'forex', '15m', 0.001, 100);
    const highVol = recommendedExpiry(null, 'forex', '15m', 2, 100);
    expect(lowVol).toBeGreaterThan(highVol);
  });

  it('returns 3x timeframe for very low volatility (< 0.5%)', () => {
    expect(recommendedExpiry(null, 'forex', '15m', 0.4, 100)).toBe(900 * 3);
  });

  it('returns 2x timeframe for medium volatility (0.5%-1%)', () => {
    expect(recommendedExpiry(null, 'forex', '15m', 0.7, 100)).toBe(900 * 2);
  });

  it('returns 1x timeframe for high volatility (> 1%)', () => {
    expect(recommendedExpiry(null, 'forex', '15m', 2, 100)).toBe(900);
  });

  it('returns timeframe seconds when atr is zero', () => {
    expect(recommendedExpiry(null, 'forex', '5m', 0, 100)).toBe(300);
  });

  it('returns timeframe seconds when entryPrice is zero', () => {
    expect(recommendedExpiry(null, 'forex', '5m', 1, 0)).toBe(300);
  });

  it('returns timeframe seconds when both atr and entryPrice are zero', () => {
    expect(recommendedExpiry(null, 'forex', '1m', 0, 0)).toBe(60);
  });

  it('works correctly for different timeframes', () => {
    expect(recommendedExpiry(null, 'forex', '1m', 2, 100)).toBe(60);
    expect(recommendedExpiry(null, 'forex', '1h', 2, 100)).toBe(3600);
    expect(recommendedExpiry(null, 'forex', '1d', 2, 100)).toBe(86400);
  });

  it('handles boundary at exactly 0.5% volatility', () => {
    expect(recommendedExpiry(null, 'forex', '15m', 0.5, 100)).toBe(900 * 2);
  });

  it('handles boundary at exactly 1% volatility', () => {
    expect(recommendedExpiry(null, 'forex', '15m', 1, 100)).toBe(900);
  });

  it('falls back for pattern absent from the table', () => {
    expect(recommendedExpiry('hammer', 'forex', '1m', 2, 100)).toBe(60);
    expect(recommendedExpiry('hammer', 'crypto', '1m', 2, 100)).toBe(60);
  });
});

describe('recommendedExpiry — таблица горизонтов', () => {
  it('в сгенерированной таблице нет valid-записей, если аудит не дал допуска (valid=0 на 2026-09-20)', () => {
    // Осознанная фиксация текущего результата: если новый прогон даст valid, этот тест нужно
    // обновить вместе с таблицей (и записью в LOGIC_CHANGE_LOG).
    const valid = (['crypto', 'forex'] as const).flatMap((ac) =>
      Object.entries(PATTERN_HORIZON_TABLE[ac]).filter(([, r]) => r?.status === 'valid'),
    );
    expect(valid.length).toBe(0);
  });

  it('valid-запись даёт табличный горизонт вместо fallback', () => {
    withRecord('crypto', 'harmonic-pattern', validHarmonic(30), () => {
      expect(lookupPatternHorizon('harmonic-pattern', 'crypto')?.status).toBe('valid');
      expect(recommendedExpiry('harmonic-pattern', 'crypto', '1m', 2, 100)).toBe(60 * 30);
    });
  });

  it('valid-горизонт имеет приоритет над чоп-поправкой', () => {
    withRecord('crypto', 'harmonic-pattern', validHarmonic(30), () => {
      expect(recommendedExpiry('harmonic-pattern', 'crypto', '1m', 2, 100, true)).toBe(60 * 30);
    });
  });

  it('no-evidence НЕ подменяет fallback и НЕ подавляет сигнал', () => {
    // BUGFIX (перегенерация после A′.5): inside-bar на crypto на реальных
    // данных оказался genuine rejected (48.8%, p=0.0000, N=84716) — заменён
    // на shooting-star, который на новой калибровке остаётся no-evidence.
    expect(PATTERN_HORIZON_TABLE.crypto['shooting-star']?.status).toBe('no-evidence');
    expect(recommendedExpiry('shooting-star', 'crypto', '1m', 2, 100)).toBe(60);
    expect(isPatternHorizonRejected('shooting-star', 'crypto')).toBe(false);
  });

  it('rejected уходит в fallback по горизонту (подавление — отдельным гейтом)', () => {
    expect(PATTERN_HORIZON_TABLE.crypto['impulse-breakout']?.status).toBe('rejected');
    expect(recommendedExpiry('impulse-breakout', 'crypto', '1m', 2, 100)).toBe(60);
  });

  it('РЕГРЕССИЯ: класс актива не протекает между таблицами', () => {
    // Разные статусы одного паттерна на разных классах (подставлены явно, чтобы тест не зависел
    // от очередной перегенерации): до скоупинга по классу актива результат одного класса
    // применился бы к обоим.
    withRecord('crypto', 'fvg-return', rejectedRec(), () => {
      withRecord('forex', 'fvg-return', noEvidenceRec(), () => {
        expect(lookupPatternHorizon('fvg-return', 'crypto')?.status).toBe('rejected');
        expect(lookupPatternHorizon('fvg-return', 'forex')?.status).toBe('no-evidence');
        expect(isPatternHorizonRejected('fvg-return', 'crypto')).toBe(true);
        expect(isPatternHorizonRejected('fvg-return', 'forex')).toBe(false);
        expect(recommendedExpiry('fvg-return', 'crypto', '1m', 2, 100)).toBe(60);
      });
    });
  });
});

describe('recommendedExpiry — setupType-aware lookup (B\'\u00b3)', () => {
  it('patternHorizonKey: null setupType → плоский ключ', () => {
    expect(patternHorizonKey('harmonic-pattern', null)).toBe('harmonic-pattern');
    expect(patternHorizonKey('harmonic-pattern', undefined)).toBe('harmonic-pattern');
  });

  it('patternHorizonKey: non-null setupType → pattern#setupType', () => {
    expect(patternHorizonKey('liquidity-sweep-reaction', 'continuation')).toBe('liquidity-sweep-reaction#continuation');
    expect(patternHorizonKey('liquidity-sweep-reaction', 'reversal-at-key-level')).toBe('liquidity-sweep-reaction#reversal-at-key-level');
  });

  it('patternHorizonKey: null pattern → null', () => {
    expect(patternHorizonKey(null, 'continuation')).toBeNull();
    expect(patternHorizonKey(null, null)).toBeNull();
  });

  it('lookupPatternHorizon: setupType-специфичный лукап находит запись, плоский — нет', () => {
    // На текущих данных liquidity-sweep-reaction в таблице нет,
    // но если бы был с setupType, плоский лукап не должен его найти.
    // Проверяем на существующей valid-записи: harmonic-pattern без setupType.
    withRecord('crypto', 'harmonic-pattern', validHarmonic(30), () => {
      expect(lookupPatternHorizon('harmonic-pattern', 'crypto', null)?.status).toBe('valid');
      expect(lookupPatternHorizon('harmonic-pattern', 'crypto', 'continuation')).toBeNull();
    });
  });

  it('isPatternHorizonRejected: setupType-специфичное подавление', () => {
    // Если бы liquidity-sweep-reaction#reversal был rejected, а #continuation — нет,
    // подавление работало бы только для своего setupType.
    // BUGFIX (перегенерация после A′.5): harmonic-pattern/forex теперь valid,
    // не rejected (см. комментарий выше) — заменён на impulse-breakout/forex,
    // genuine rejected на реальных данных (45.3%, p=0.0000), без setupType.
    expect(isPatternHorizonRejected('impulse-breakout', 'forex', null)).toBe(true);
    expect(isPatternHorizonRejected('impulse-breakout', 'forex', 'continuation')).toBe(false);
  });

  it('recommendedExpiry: setupType-специфичный valid-горизонт', () => {
    withRecord('crypto', 'harmonic-pattern', validHarmonic(30), () => {
      expect(recommendedExpiry('harmonic-pattern', 'crypto', '1m', 2, 100, false, null)).toBe(60 * 30);
      // Несуществующий setupType → fallback
      expect(recommendedExpiry('harmonic-pattern', 'crypto', '1m', 2, 100, false, 'continuation')).toBe(60);
    });
  });
});

describe('fallbackExpiry', () => {
  it('returns 3x for very low volatility', () => {
    expect(fallbackExpiry('15m', 0.4, 100)).toBe(900 * 3);
  });

  it('adds 1 bar for range with weak trend', () => {
    const normal = fallbackExpiry('15m', 2, 100, false);
    const weak = fallbackExpiry('15m', 2, 100, true);
    expect(weak).toBe(normal + 900);
  });
});

describe('isPatternHorizonRejected', () => {
  it('true только при значимом отличии В ХУДШУЮ сторону', () => {
    expect(isPatternHorizonRejected('impulse-breakout', 'crypto')).toBe(true);
    // BUGFIX (перегенерация после реального прогона A′.5, 2026-09-19):
    // раньше здесь стоял ('harmonic-pattern', 'forex') на месячной выборке
    // 2 инструментов, где он значимо проигрывал (rejected). На полном
    // объёме (4 форекс-инструмента, 6.5 месяца) harmonic-pattern на forex —
    // valid (51.9%, p=0.0023, Wilson pass), а не rejected — вердикт
    // полностью развернулся с ростом выборки. impulse-breakout на forex
    // сейчас настоящий rejected-пример на реальных данных (45.3%, p=0.0000).
    expect(isPatternHorizonRejected('impulse-breakout', 'forex')).toBe(true);
  });

  it('false для valid', () => {
    expect(isPatternHorizonRejected('harmonic-pattern', 'crypto')).toBe(false);
    expect(isPatternHorizonRejected('harmonic-pattern', 'forex')).toBe(false);
  });

  it('РЕГРЕССИЯ: no-evidence НЕ подавляет (нет доказательств ≠ доказано обратное)', () => {
    // Прежняя двухстатусная схема выключала все три целиком.
    // BUGFIX (перегенерация после A′.5): inside-bar/strong-order-block-reaction
    // на crypto и impulse-breakout на forex, ранее использовавшиеся здесь как
    // примеры no-evidence, на реальных данных оказались genuine rejected
    // (значимо хуже случайного на десятках тысяч исходов) — см. комментарий
    // в тесте выше. Заменены на паттерны, которые на новой калибровке
    // действительно остаются no-evidence (недостаточно доказательств в любую
    // сторону, а не доказанное отсутствие эджа).
    expect(isPatternHorizonRejected('shooting-star', 'crypto')).toBe(false);
    expect(isPatternHorizonRejected('fvg-nested', 'forex')).toBe(false);
    expect(isPatternHorizonRejected('order-block-nested', 'crypto')).toBe(false);
    expect(isPatternHorizonRejected('order-block-continuation', 'forex')).toBe(false);
    expect(isPatternHorizonRejected('marubozu-bullish', 'forex')).toBe(false);
  });

  it('false для отсутствующего паттерна и для null', () => {
    expect(isPatternHorizonRejected('hammer', 'crypto')).toBe(false);
    expect(isPatternHorizonRejected(null, 'forex')).toBe(false);
  });
});
