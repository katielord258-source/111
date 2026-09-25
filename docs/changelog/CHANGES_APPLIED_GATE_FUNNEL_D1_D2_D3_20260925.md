# CHANGES_APPLIED_GATE_FUNNEL_D1_D2_D3_20260925.md — D1/D2/D3 по промту «Исправление по воронке гейтов»

Дата: 2026-09-25.

## Контекст

Промт «Исправление по воронке гейтов» и разбор 13 живых сделок (винрейт
15% за 4 часа) выявили: valid=0 на обоих пулах, живой сигнал в основном
не паттерн (композит EMA/MACD/BOS без RSI/сессионных гейтов), сессионный
гейт `isAsiaOrClosed` неверно применялся к 24/7-инструментам (крипта),
асимметрия RSI-гейтов внутри hammer-семейства, и несколько независимых
багов измерения (`trade-report.ts`, единая точка отказа Deriv WS в
историческом загрузчике, опасные дефолты демо-счёта).

Отдельно обнаружено и задокументировано (см. п. «Провенанс» ниже): более
ранний прогон, вернувший `algorithmVersion: 6`, был выполнен с кода,
которого не осталось ни в одном коммите репозитория — предположительно
правки делались в Bolt.new и не были запушены до пересоздания сессии.
Те отчёты (`algorithmVersion: 6`) невоспроизводимы; номер 6 сознательно
не переиспользован.

## D1 — sessionAgnostic для крипты

`getSessionRegime()` размечает `'closed'/'sydney'/'tokyo'` по
форекс-календарю (включая выходные) — корректно для FX, но крипта
торгуется 24/7. Жёсткий гейт `isAsiaOrClosed()` применялся к обоим
классам активов одинаково и отсекал ~58% недели для крипты без
рыночного основания.

- `src/compute/patterns/pattern-context.ts`: `PatternContext.sessionAgnostic?: boolean`;
  `isAsiaOrClosed(session, sessionAgnostic?)` — при `true` гейт полностью
  отключён. `sessionBoost()` (мягкий множитель) не тронут — суточная
  сезонность у крипты реальна.
- Параметр пробит через `detectAllPatterns()` во все 27 точек вызова
  `isAsiaOrClosed` (`single.ts`, `double.ts`, `triple.ts`,
  `continuation.ts`, `pin-bar.ts`, `liquidity-sweep.ts`,
  `consolidation-breakout.ts`, `mean-reversion.ts`) и во все точки
  построения снапшота: `full-snapshot.ts` → `useTickStore.ts`,
  `worker.ts` (оба вызова), `analysisEngine.ts` (общий путь для live и
  для композитного бэктеста через `runEngine`) и `backtest/horizon-audit.ts`
  (`buildOccurrences`).
- Источник признака — существующий `isCrypto(symbolId)` из `@/data/symbols`,
  без нового понятия класса актива.

## D2 — зеркальный RSI-гейт shooting-star

Из четырёх членов hammer-семейства только `shooting-star` не имел
RSI-гейта (`hammer`/`inverted-hammer`: `rsi>40→отказ`; `hanging-man`:
зеркало `rsi<60→отказ`), а также имел другой потолок `base` (0.50 вместо
0.45) и другой порог confidence (0.50 вместо 0.45).

- `src/compute/patterns/single.ts`, `detectShootingStar`: добавлен
  `gate('shooting-star:03-rsi')` с условием `rsi<60→отказ` (дословное
  зеркало `hanging-man`); добавлен `rsiFactor` в формулу confidence;
  `base` выровнен на потолок 0.45 (было 0.50); порог входа — 0.45
  (было 0.50). Рекомендация промта выполнена буквально: гейты у
  `hammer`/`inverted-hammer`/`hanging-man` не снимались.

## D3 — измерение (без изменения поведения)

Новый независимый диагностический канал `src/compute/patterns/diagnostic-trace.ts`
(отдельный от `gate-trace.ts` — у обоих разрезов ниже монотонность
относительно соседних стадий воронки не сохраняется по построению, что
сломало бы существующий строго-монотонный тест `gate-trace.test.ts`).
Активируется тем же флагом `--funnel`, что и обычная воронка; вне
трассировки — no-op.

- Разрез по классу HTF-множителя (`htfAlignment()`: 1.00-bos / 0.75-choch
  / 0.40-range / other=0.5) — `htf-seen-*` (дошли до финальной проверки
  confidence) и `htf-pass-*` (прошли порог) для `hammer`,
  `inverted-hammer`, `hanging-man`, `shooting-star`.
- Раздельные стадии `mean-reversion` (было: одна склеенная
  `05-band-exit-rsi`) — `05a-band-exit-only-{buy,sell}` (геометрия
  «вышел за BB и вернулся» сама по себе) и `05b-band-exit-and-rsi-{buy,sell}`
  (та же геометрия и RSI(7) в экстремальной зоне).
- Результат — новое поле `diagnosticFunnel` в JSON-отчёте и отдельный
  раздел в markdown-отчёте (`backtest/horizon-audit.ts`), не пересекается
  с существующим `gateFunnel`.

## Прочие исправления из промта

- `src/lib/trade-report.ts:50`: `candlesAfter?.[0]` → `candlesAfter?.[expiryBars-1]`.
  Баг был только в тексте постмортем-отчёта; исход (`resolveOutcome`)
  всегда считался верно по `expiryBars-1`.
- `src/stores/useDemoAccountStore.ts`: дефолты нового/сброшенного
  демо-счёта `autoTradeEnabled`/`martingaleEnabled` — `true` → `false`.
  Уже сохранённые состояния существующих пользователей не затронуты
  (`persist` не перезаписывает существующие ключи). Миграция для
  pre-v6 состояний (`migrateDemoAccountState`, `?? true`) сознательно
  НЕ тронута — отдельное решение с последствиями для существующих
  пользователей, задокументированное в коде как таковое.
- `backtest/data-loader.ts`: убрана единственная точка отказа
  `DERIV_WS` (один захардкоженный хост) в историческом загрузчике —
  фикс fallback-хостов из `CHANGES_APPLIED_DERIV_WS_ENDPOINT_FALLBACK_20260921.md`
  применялся только к live-подключению (`src/data/sources/deriv.ts`) и
  не распространялся на этот отдельный, самостоятельный скрипт аудита.
  Добавлены `getDerivWsUrls()` (список хостов из
  `PROVIDERS_CONFIG.deriv.wsEndpoints`, без завязки на браузерный
  `useApiKeysStore`/`import.meta.env` — под `tsx` их нет) и
  `fetchDerivBatchWithFallback()` (перебор хостов, у каждого свой
  бюджет ретраев).
- `backtest/audit-version.ts`: `OCCURRENCE_ALGORITHM_VERSION` 5 → 7
  (6 намеренно пропущен, см. «Провенанс» выше). В `backtest/horizon-audit.ts`
  JSON-отчёт теперь пишет `meta.commitHash` (`GITHUB_SHA` в CI,
  `git rev-parse HEAD` локально, `'unknown'` как крайний случай) — чтобы
  расхождение «отчёт не совпадает ни с одним коммитом» было видно сразу,
  а не вскрывалось раскопками постфактум.

## Сознательно НЕ сделано в этом заходе

Ниже — пункты «Фазы 3» промта, требующие новой инфраструктуры измерения
(не однострочных фиксов) и, по собственной логике промта, отдельного
критерия приёмки, зафиксированного ДО прогона, с записью в
`LOGIC_CHANGE_LOG` (каждая такая правка сбрасывает форвард-тест):

- аудит композитного сигнала (`pattern === null`, EMA/MACD/BOS/пул
  ликвидности) — основная часть живого потока по-прежнему не измерена;
- тест паритета аудит↔приложение (pre-close вход vs вход по закрытой
  свече, спред, ничьи);
- единицы порога в `fallbackExpiry` (0.5%/1% против ATR/цены на M1);
- совпадение `scoreThreshold` с `STRONG_SIGNAL_SCORE_THRESHOLD` (оба 4);
- модель спреда для бинарного контракта (расходится с правилами Deriv
  Rise/Fall).

## Проверка

Полного `npm test`/`typecheck`/`lint` не выполнялось — в среде правки
нет `node_modules` и сети для `npm ci`. Проверено доступными средствами:
все .ts/.tsx файлы проекта (159 продакшн + 86 тестовых) синтаксически
валидны (`esbuild`, без резолва типов); все новые/изменённые импорты
сверены построчно с фактическими экспортами модулей, на которые они
ссылаются. Перед мержем обязателен `npm run typecheck && npm test`
(включая `patterns.test.ts`, `gate-trace.test.ts`) и свежий прогон
`horizon-audit-full.yml` — закоммиченные `backtest/output/*.json`
теперь помечены `gen-horizon-table:check:strict` как устаревшие
(`algorithmVersion` 5/6 ≠ 7), это ожидаемо.
