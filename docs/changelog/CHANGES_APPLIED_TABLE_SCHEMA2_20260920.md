# Таблица горизонтов по отчётам аудита схемы 2 — 2026-09-20

Отчёты: `backtest/output/horizon-audit-{BTCUSDT-…-BNBUSDT,EURUSD-…-AUDUSD}-1m-walkforward-2026-03-01-2026-09-17.{json,md}`
(GitHub Actions, версия алгоритма occurrences 5, `--indicators=live`, payout 80% → безубыток 55,56%, `--funnel`, dedupe-scope=pool).

## Результат аудита
- **valid = 0 на обоих пулах.** Ни у одного из 41 паттернов нет доказанного преимущества выше безубыточности (и выше дрейф-baseline).
- rejected: crypto 10, forex 3 (значимо ХУЖЕ 50% по независимым наблюдениям; отказ идёт по сырому alpha, без Холма, — ~5% ложных на паттерн ожидаемы).
- `harmonic-pattern`: сырая точность 53,2% (crypto) / 51,9% (forex) при p≈0, по независимым наблюдениям 52,1% (p=0,217; n_test=898) / 47,2% (p=0,184) → no-evidence. Прежний `valid` был следствием перекрытия срабатываний.
- Не срабатывали ни разу: mean-reversion, macd-deceleration-continuation, fvg-rejection, tweezer-top/bottom, abandoned-baby-top/bottom, rising-three-methods (+falling-three-methods на forex). Единицы–десятки срабатываний: hammer, hanging-man, inverted-hammer, engulfing ×2, harami ×2, piercing-line, dark-cloud-cover, morning/evening-star, three-white-soldiers/black-crows.

## Изменения таблицы (`src/decision/pattern-horizon-table.ts`)
| Класс | Паттерн | Было → стало | Эффект в приложении |
|---|---|---|---|
| crypto | harmonic-pattern | valid → no-evidence | горизонт из таблицы больше не берётся (fallback) |
| forex | harmonic-pattern | valid → no-evidence | то же |
| crypto | fvg-return | no-evidence → rejected | сигналы подавляются |
| crypto | fvg-nested | no-evidence → rejected | подавляются |
| crypto | order-block-breaker | нет записи → rejected | подавляются |
| crypto | fvg-breaker-block | нет записи → rejected | подавляются |
| crypto | consolidation-breakout | нет записи → rejected | подавляются |
| forex | consolidation-breakout | нет записи → rejected | подавляются |
| crypto | strong-order-block-reaction | rejected → no-evidence | подавление СНЯТО (дедуп. p=0,274) |
| forex | fvg-breaker-block, order-block-breaker | нет записи → no-evidence | без изменений в поведении |

Тесты, привязанные к старой таблице (`recommended-expiry.test.ts` — 6, `signal-builder.test.ts` — 1), обновлены осознанно:
механика `valid → табличный горизонт` теперь проверяется на временно подставленной записи, а не на содержимом
сгенерированной таблицы; отдельный тест фиксирует «valid=0 на 2026-09-20».

## Воронка гейтов (не менять пороги по одному прогону — отдельное решение)
- hammer / hanging-man / inverted-hammer (crypto): 1 149 090 оценок → context 61% → **session 26%** → rsi 7,2% → geometry 0,37% → confirmation 0,10% → **confidence 73**.
  Сессионный гейт режет ~57% оставшихся кандидатов на 24/7-инструменте (крипта).
- shooting-star: RSI-гейта нет вообще (у hammer — `rsi > 40 → null`, отсев ~73%): асимметрия buy/sell в коде; 1 399 срабатываний против 73.
- mean-reversion: bar-geometry отсеивает ~86%, `band-exit-rsi` — 81 435 → 41; итог 0 срабатываний.

## Запись в LOGIC_CHANGE_LOG — добавлена (деплой 2026-09-21)
`horizon-table-schema2`, `frozenAtMs = Date.UTC(2026, 8, 21)`; запись `audit-review-fixes` перенесена на ту же дату (её правки в приложение до деплоя не попадали).
`currentFreezeMs()` = 2026-09-21T00:00Z: форвард-тест САМОГО приложения (backtest/change-registry.ts) считается с этого момента. На отдельный офлайн-форвард `reversal-top1pct-v1` это не влияет.
Если фактический деплой пришёлся на другой день — обе записи `frozenAtMs` нужно исправить на реальную дату (задним числом ставить нельзя).
