# Decision: per-pattern expiry UX

**Status:** accepted, v1.0 (2026-09-18)

## Decision

We choose option A: show the recommended expiry on the signal card before the position is opened.

This is already the live behavior in the app: `signal.recommendedExpiry` is surfaced per signal and used directly by the product UI, not as a hidden implementation detail. We are making that behavior explicit so it remains intentional, testable, and consistent with the regression guard around pattern horizon calibration.

## Rationale

1. The expiry horizon is a property of the pattern, not of the user’s final chosen trade duration.
2. The pattern calibration table is already the source of truth for valid horizons (`recommendedExpiry()` checks `PATTERN_HORIZON_TABLE` before fallback).
3. The product requirement in this project is to display the signal-specific recommended expiry before entry, because the signal is already scored and reasoned as a pattern-specific trade setup.
4. A user-selected duration filter would add a second, competing expiry concept and create confusion between “calibrated pattern horizon” and “manual trade duration”.

## Non-goal / explicit limitation

We are not filtering the signal card by the current user-selected trade duration by default. This is a deliberate product choice, not an accidental side effect.

If a future UX decision chooses option B, that will require an explicit product change with a different decision record and likely an additional UI control in the signal card or trade ticket.

## Engineering implications

- `recommendedExpiry()` remains the canonical calculation entry point.
- `PATTERN_HORIZON_TABLE` is authoritative when a pattern is `valid`.
- `isPatternHorizonRejected()` continues to suppress rejected patterns before signal creation.
- The UI displays the signal’s `recommendedExpiry` as the default time-to-resolution; any manual override remains a separate later UX feature.

## Дополнение (ревизия 2026-09-18)

Два уточнения, вытекающих из слияния веток:

1. **Приоритет таблицы над чоп-поправкой зафиксирован явно.** Когда паттерн имеет
   статус `valid`, `recommendedExpiry()` возвращает табличный `expiryBars` и
   **не применяет** поправку `isRangeWithWeakTrend` (+1 бар) из аудита 2026-09-06.
   Обоснование: табличный горизонт измерен на отложенных данных, а поправка выведена
   из волатильности; смешивать измеренное с выведенным нельзя. Для `no-evidence` и
   `rejected` поправка работает как прежде. Закреплено тестом
   `src/decision/recommended-expiry.test.ts` («valid-горизонт имеет приоритет над
   чоп-поправкой»).

2. **Подавление сигнала — отдельный гейт, не часть выбора экспирации.**
   `isPatternHorizonRejected()` срабатывает только на статусе `rejected`, то есть
   при значимом отличии в **худшую** сторону, и скоупнут по классу актива. Статус
   `no-evidence` («отличие от 50% не установлено») сигнал не подавляет. До ревизии
   эти два случая были склеены, и карточка сигнала просто переставала появляться
   для паттернов, про которые данные ничего не утверждали.
