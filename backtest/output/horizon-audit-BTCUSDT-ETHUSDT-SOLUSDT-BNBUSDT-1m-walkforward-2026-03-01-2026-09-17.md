# Horizon Audit — BTCUSDT, ETHUSDT, SOLUSDT, BNBUSDT 1m

> Сгенерировано: 2026-09-20T15:33:31.465Z
> Период: 2026-03-01 → 2026-09-17
> Инструменты (пул): BTCUSDT, ETHUSDT, SOLUSDT, BNBUSDT
> Источник: Deriv WebSocket (1m candles → resampled to 1m)
> Разбиение: walk-forward, 8 folds, purge 30 bars
> Минимальный порог (train+validation): 30 срабатываний
> Минимальный порог для теста значимости (test-выборка): 200 решённых исходов
> Значимость: точный двусторонний биномиальный тест против baseline=0.5, с поправкой Holm-Bonferroni, α = 0.05
> Wilson-критерий: нижняя граница 95% интервала Уилсона ≥ 0.500 (margin=0)
> **Вердикт** (схема 2): по ДЕДУПЛИЦИРОВАННЫМ независимым наблюдениям (--dedupe-scope=pool); Holm по дедуплицированному семейству; допуск ('valid') требует нижней границы Уилсона выше max(безубыточность, дрейф-baseline).
> Выплата (payout): 80% → безубыточная доля выигрышей 55.56%
> Индикаторы: --indicators=live (18 шт.); версия алгоритма occurrences: 5

**Загружено**: 1151210 1m свечей (суммарно по пулу), 1151210 1m свечей после ресэмплинга.

## Метаданные пула

| Инструмент | 1m свечей | 1m свечей |
|---|---|---|
| BTCUSDT | 287804 | 287804 |
| ETHUSDT | 287804 | 287804 |
| SOLUSDT | 287798 | 287798 |
| BNBUSDT | 287804 | 287804 |

> **Предупреждение о корреляции**: Пул содержит 4 инструментов. Корреляция между инструментами (особенно forex-парами с общей валютой и крипто-парами к USDT) может завышать эффективный размер выборки. Сырой p-value НЕ корректируется на межинструментную корреляцию — он оставлен только для сравнения с прошлыми отчётами. Вердикт строится по дедуплицированным наблюдениям с независимостью ПО ВСЕМУ ПУЛУ (--dedupe-scope=pool): сигналы разных инструментов в пределах горизонта считаются одним событием — это консервативная поправка на межинструментную корреляцию.

## Сводка

- Паттернов в сетке: 41
- **Вердикт valid** (дедуп. + Holm + Wilson + безубыточность 55.56%): **0**
- Вердикт rejected (значимо ХУЖЕ 50% на независимых наблюдениях): 10
- Значимых вверх по дедуп. (Holm), но не выше безубыточности: 0
- Значимых вверх по дедуп. (Holm), всего: 0
- Для сравнения — значимых по СЫРЫМ наблюдениям (Holm, без дедупа): 1; прошли сырой Wilson-гейт: 1
- Недостаточно данных: 17
- Нет срабатываний: 8

### Пересечение критериев

- Прошли оба (формальный + Wilson): 1
- Только формальный тест: 0
- Только Wilson-гейт: 0

## Результаты по паттернам

| Паттерн | Setup | Всего | Σ train по фолдам | Test | Независ. (все) | Независ. test | Лучший expiry | Test acc | p-value | Acc дедуп. | p (дедуп.) | Значим (сырой) | Значим (дедуп.) | Wilson LB | Wilson LB дедуп. | Нужно > | Вердикт | Статус |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| liquidity-sweep | reversal-at-key-level | 418 | 1565 | 352 | 374 | 317 | 1 | 54.0% | 0.1500 | 54.3% | 0.1441 | нет | нет | 48.8% | 48.8% | 55.6% | no-evidence (not distinguishable from baseline (deduplicated)) | OK |
| harmonic-pattern | — | 12478 | 45387 | 10792 | 1024 | 898 | 30 | 53.2% | 0.0000 | 52.1% | 0.2169 | да | нет | 52.2% | 48.8% | 55.6% | no-evidence (not distinguishable from baseline (deduplicated)) | OK |
| shooting-star | — | 1399 | 3937 | 1262 | 1205 | 1082 | 3 | 51.0% | 0.5174 | 51.2% | 0.4473 | нет | нет | 48.2% | 48.2% | 55.6% | no-evidence (not distinguishable from baseline (deduplicated)) | OK |
| bullish-harami | — | 80 | 199 | 45 | — | — | 5 | 51.1% | — | — | — | — | — | 37.0% | — | — | — | недостаточно данных |
| bearish-engulfing | — | 61 | 181 | 28 | — | — | 5 | 50.0% | — | — | — | — | — | 32.6% | — | — | — | недостаточно данных |
| hammer | — | 73 | 71 | 2 | — | — | 2 | 50.0% | — | — | — | — | — | 9.5% | — | — | — | недостаточно данных |
| strong-order-block-reaction | — | 45471 | 158319 | 38238 | 7016 | 5893 | 1 | 48.5% | 0.0000 | 49.3% | 0.2739 | нет | нет | 48.0% | 48.0% | 55.6% | no-evidence (not distinguishable from baseline (deduplicated)) | OK (значимо ХУЖЕ 50%) |
| inside-bar | — | 99438 | 332370 | 84716 | 43827 | 37015 | 5 | 48.8% | 0.0000 | 49.1% | 0.0007 | нет | нет | 48.5% | 48.6% | 55.6% | rejected (significant below baseline (deduplicated)) | OK (значимо ХУЖЕ 50%) |
| bearish-harami | — | 81 | 271 | 45 | — | — | 5 | 48.9% | — | — | — | — | — | 35.0% | — | — | — | недостаточно данных |
| inverted-hammer | — | 78 | 108 | 45 | — | — | 5 | 48.9% | — | — | — | — | — | 35.0% | — | — | — | недостаточно данных |
| order-block-continuation | — | 12462 | 42456 | 10923 | 4575 | 4044 | 10 | 47.8% | 0.0000 | 48.2% | 0.0266 | нет | нет | 46.8% | 46.7% | 55.6% | rejected (significant below baseline (deduplicated)) | OK (значимо ХУЖЕ 50%) |
| marubozu-bearish | — | 548 | 1642 | 507 | 436 | 367 | 2 | 47.9% | 0.3744 | 48.2% | 0.5311 | нет | нет | 43.6% | 43.2% | 55.6% | no-evidence (not distinguishable from baseline (deduplicated)) | OK |
| order-block-nested | — | 2620 | 8944 | 2301 | 1011 | 895 | 30 | 49.9% | 0.9667 | 47.7% | 0.1812 | нет | нет | 47.9% | 44.5% | 55.6% | no-evidence (not distinguishable from baseline (deduplicated)) | OK |
| fvg-breaker-block | — | 2847 | 9857 | 2464 | 2022 | 1761 | 5 | 46.8% | 0.0016 | 47.6% | 0.0453 | нет | нет | 44.8% | 45.3% | 55.6% | rejected (significant below baseline (deduplicated)) | OK (значимо ХУЖЕ 50%) |
| fvg-nested | — | 21500 | 75522 | 18799 | 3742 | 3300 | 5 | 46.9% | 0.0000 | 47.3% | 0.0021 | нет | нет | 46.2% | 45.6% | 55.6% | rejected (significant below baseline (deduplicated)) | OK (значимо ХУЖЕ 50%) |
| fvg-return | — | 76813 | 268710 | 64167 | 8030 | 6793 | 1 | 47.6% | 0.0000 | 47.3% | 0.0000 | нет | нет | 47.2% | 46.1% | 55.6% | rejected (significant below baseline (deduplicated)) | OK (значимо ХУЖЕ 50%) |
| consolidation-breakout | — | 4313 | 13071 | 3794 | 2932 | 2579 | 1 | 46.9% | 0.0002 | 47.0% | 0.0021 | нет | нет | 45.4% | 45.0% | 55.6% | rejected (significant below baseline (deduplicated)) | OK (значимо ХУЖЕ 50%) |
| order-block-breaker | — | 4903 | 17238 | 4214 | 2938 | 2555 | 30 | 46.0% | 0.0000 | 46.8% | 0.0012 | нет | нет | 44.5% | 44.8% | 55.6% | rejected (significant below baseline (deduplicated)) | OK (значимо ХУЖЕ 50%) |
| bullish-engulfing | — | 61 | 168 | 28 | — | — | 1 | 46.4% | — | — | — | — | — | 29.5% | — | — | — | недостаточно данных |
| impulse-breakout | — | 22441 | 76039 | 19387 | 10818 | 9412 | 1 | 45.1% | 0.0000 | 45.9% | 0.0000 | нет | нет | 44.4% | 44.9% | 55.6% | rejected (significant below baseline (deduplicated)) | OK (значимо ХУЖЕ 50%) |
| pin-bar | — | 397 | 1299 | 356 | 340 | 305 | 1 | 44.1% | 0.0296 | 43.6% | 0.0294 | нет | нет | 39.0% | 38.2% | 55.6% | rejected (significant below baseline (deduplicated)) | OK (значимо ХУЖЕ 50%) |
| marubozu-bullish | — | 586 | 1999 | 540 | 468 | 428 | 1 | 44.1% | 0.0067 | 41.1% | 0.0003 | нет | нет | 39.9% | 36.6% | 55.6% | rejected (significant below baseline (deduplicated)) | OK (значимо ХУЖЕ 50%) |
| liquidity-sweep-reaction | reversal-at-key-level | 55 | 82 | 18 | — | — | 3 | 38.9% | — | — | — | — | — | 20.3% | — | — | — | недостаточно данных |
| hanging-man | — | 58 | 54 | 4 | — | — | 2 | 25.0% | — | — | — | — | — | 4.6% | — | — | — | недостаточно данных |
| piercing-line | — | 12 | 4 | 8 | — | — | — | — | — | — | — | — | — | — | — | — | — | недостаточно данных |
| three-black-crows | — | 8 | 1 | 7 | — | — | — | — | — | — | — | — | — | — | — | — | — | недостаточно данных |
| morning-star | — | 5 | 0 | 5 | — | — | — | — | — | — | — | — | — | — | — | — | — | недостаточно данных |
| three-white-soldiers | — | 15 | 1 | 14 | — | — | — | — | — | — | — | — | — | — | — | — | — | недостаточно данных |
| dark-cloud-cover | — | 11 | 0 | 11 | — | — | — | — | — | — | — | — | — | — | — | — | — | недостаточно данных |
| liquidity-sweep | continuation | 12 | 1 | 11 | — | — | — | — | — | — | — | — | — | — | — | — | — | недостаточно данных |
| liquidity-sweep-reaction | continuation | 2 | 1 | 1 | — | — | — | — | — | — | — | — | — | — | — | — | — | недостаточно данных |
| evening-star | — | 3 | 1 | 2 | — | — | — | — | — | — | — | — | — | — | — | — | — | недостаточно данных |
| falling-three-methods | — | 1 | 0 | 1 | — | — | — | — | — | — | — | — | — | — | — | — | — | недостаточно данных |
| mean-reversion | — | 0 | 0 | 0 | — | — | — | — | — | — | — | — | — | — | — | — | — | нет срабатываний |
| macd-deceleration-continuation | — | 0 | 0 | 0 | — | — | — | — | — | — | — | — | — | — | — | — | — | нет срабатываний |
| fvg-rejection | — | 0 | 0 | 0 | — | — | — | — | — | — | — | — | — | — | — | — | — | нет срабатываний |
| tweezer-bottom | — | 0 | 0 | 0 | — | — | — | — | — | — | — | — | — | — | — | — | — | нет срабатываний |
| tweezer-top | — | 0 | 0 | 0 | — | — | — | — | — | — | — | — | — | — | — | — | — | нет срабатываний |
| abandoned-baby-bottom | — | 0 | 0 | 0 | — | — | — | — | — | — | — | — | — | — | — | — | — | нет срабатываний |
| abandoned-baby-top | — | 0 | 0 | 0 | — | — | — | — | — | — | — | — | — | — | — | — | — | нет срабатываний |
| rising-three-methods | — | 0 | 0 | 0 | — | — | — | — | — | — | — | — | — | — | — | — | — | нет срабатываний |

## Воронка гейтов (инструментированные детекторы)

> Сколько баров дошло до каждого этапа детектора; разница соседних строк — отсев на этом гейте. Покрыты только детекторы с вызовами `gate()` (hammer, inverted-hammer, hanging-man, shooting-star, mean-reversion); остальные в воронке не участвуют. Счётчики — суммарно по пулу, за весь период (не только test).

### hammer

| Этап (кандидат дошёл до) | Дошло | % от вызовов | Отсеяно на этом гейте |
|---|---|---|---|
| 00-evaluated | 1149090 | 100.000% | — |
| 01-context | 705800 | 61.423% | 443290 |
| 02-session | 300353 | 26.138% | 405447 |
| 03-rsi | 82423 | 7.173% | 217930 |
| 04-geometry | 4210 | 0.366% | 78213 |
| 05-confirmation | 1117 | 0.097% | 3093 |
| 06-confidence | 73 | 0.006% | 1044 |

### hanging-man

| Этап (кандидат дошёл до) | Дошло | % от вызовов | Отсеяно на этом гейте |
|---|---|---|---|
| 00-evaluated | 1149090 | 100.000% | — |
| 01-context | 708898 | 61.692% | 440192 |
| 02-session | 300238 | 26.128% | 408660 |
| 03-rsi | 83184 | 7.239% | 217054 |
| 04-geometry | 3696 | 0.322% | 79488 |
| 05-confirmation | 861 | 0.075% | 2835 |
| 06-confidence | 58 | 0.005% | 803 |

### inverted-hammer

| Этап (кандидат дошёл до) | Дошло | % от вызовов | Отсеяно на этом гейте |
|---|---|---|---|
| 00-evaluated | 1149090 | 100.000% | — |
| 01-context | 705800 | 61.423% | 443290 |
| 02-session | 300353 | 26.138% | 405447 |
| 03-rsi | 82423 | 7.173% | 217930 |
| 04-geometry | 3775 | 0.329% | 78648 |
| 05-confirmation | 889 | 0.077% | 2886 |
| 06-confidence | 78 | 0.007% | 811 |

### mean-reversion

| Этап (кандидат дошёл до) | Дошло | % от вызовов | Отсеяно на этом гейте |
|---|---|---|---|
| 00-evaluated | 1149090 | 100.000% | — |
| 01-indicators | 1149090 | 100.000% | 0 |
| 02-no-bos-block | 1145439 | 99.682% | 3651 |
| 03-adx | 654739 | 56.979% | 490700 |
| 04-bar-geometry | 81435 | 7.087% | 573304 |
| 05-band-exit-rsi | 41 | 0.004% | 81394 |

### shooting-star

| Этап (кандидат дошёл до) | Дошло | % от вызовов | Отсеяно на этом гейте |
|---|---|---|---|
| 00-evaluated | 1149090 | 100.000% | — |
| 01-context | 708898 | 61.692% | 440192 |
| 02-session | 278187 | 24.209% | 430711 |
| 04-geometry | 14370 | 1.251% | 263817 |
| 05-confirmation | 7152 | 0.622% | 7218 |
| 06-confidence | 1399 | 0.122% | 5753 |


## Разбивка по инструментам

### liquidity-sweep (reversal-at-key-level)

| Инструмент | Всего | Test | Test decided | Test accuracy |
|---|---|---|---|---|
| SOLUSDT | 113 | 92 | 86 | 59.3% |
| ETHUSDT | 104 | 89 | 89 | 46.1% |
| BTCUSDT | 102 | 91 | 91 | 61.5% |
| BNBUSDT | 99 | 89 | 86 | 48.8% |

### harmonic-pattern

| Инструмент | Всего | Test | Test decided | Test accuracy |
|---|---|---|---|---|
| BTCUSDT | 3465 | 2944 | 2944 | 54.0% |
| SOLUSDT | 3170 | 2686 | 2647 | 55.5% |
| ETHUSDT | 2927 | 2640 | 2640 | 52.3% |
| BNBUSDT | 2916 | 2571 | 2561 | 50.8% |

### shooting-star

| Инструмент | Всего | Test | Test decided | Test accuracy |
|---|---|---|---|---|
| SOLUSDT | 771 | 732 | 682 | 52.5% |
| BNBUSDT | 460 | 447 | 439 | 51.3% |
| ETHUSDT | 139 | 139 | 138 | 53.6% |
| BTCUSDT | 29 | 29 | 29 | 55.2% |

### bullish-harami

| Инструмент | Всего | Test | Test decided | Test accuracy |
|---|---|---|---|---|
| ETHUSDT | 27 | 23 | 23 | 65.2% |
| BNBUSDT | 26 | 24 | 23 | 52.2% |
| BTCUSDT | 18 | 17 | 17 | 35.3% |
| SOLUSDT | 9 | 8 | 8 | 37.5% |

### bearish-engulfing

| Инструмент | Всего | Test | Test decided | Test accuracy |
|---|---|---|---|---|
| BNBUSDT | 18 | 13 | 13 | 61.5% |
| SOLUSDT | 17 | 13 | 13 | 69.2% |
| BTCUSDT | 13 | 13 | 13 | 61.5% |
| ETHUSDT | 13 | 11 | 11 | 45.5% |

### hammer

| Инструмент | Всего | Test | Test decided | Test accuracy |
|---|---|---|---|---|
| BNBUSDT | 39 | 39 | 36 | 61.1% |
| SOLUSDT | 30 | 30 | 24 | 50.0% |
| ETHUSDT | 3 | 3 | 3 | 33.3% |
| BTCUSDT | 1 | 1 | 1 | 100.0% |

### strong-order-block-reaction

| Инструмент | Всего | Test | Test decided | Test accuracy |
|---|---|---|---|---|
| BTCUSDT | 11683 | 10252 | 10237 | 47.6% |
| ETHUSDT | 11466 | 9972 | 9763 | 49.3% |
| SOLUSDT | 11401 | 10010 | 8783 | 50.1% |
| BNBUSDT | 10921 | 9496 | 9066 | 49.2% |

### inside-bar

| Инструмент | Всего | Test | Test decided | Test accuracy |
|---|---|---|---|---|
| SOLUSDT | 28844 | 25858 | 24529 | 47.9% |
| BNBUSDT | 25605 | 22740 | 22514 | 48.9% |
| ETHUSDT | 22774 | 20365 | 20306 | 47.6% |
| BTCUSDT | 22215 | 19837 | 19832 | 48.0% |

### bearish-harami

| Инструмент | Всего | Test | Test decided | Test accuracy |
|---|---|---|---|---|
| ETHUSDT | 28 | 28 | 28 | 57.1% |
| BNBUSDT | 22 | 19 | 19 | 36.8% |
| SOLUSDT | 16 | 14 | 14 | 78.6% |
| BTCUSDT | 15 | 12 | 12 | 58.3% |

### inverted-hammer

| Инструмент | Всего | Test | Test decided | Test accuracy |
|---|---|---|---|---|
| BNBUSDT | 40 | 39 | 38 | 52.6% |
| SOLUSDT | 30 | 30 | 28 | 57.1% |
| BTCUSDT | 4 | 3 | 3 | 66.7% |
| ETHUSDT | 4 | 4 | 4 | 50.0% |

### order-block-continuation

| Инструмент | Всего | Test | Test decided | Test accuracy |
|---|---|---|---|---|
| BTCUSDT | 3389 | 3003 | 3002 | 47.2% |
| BNBUSDT | 3304 | 2899 | 2880 | 49.2% |
| ETHUSDT | 2975 | 2633 | 2632 | 48.4% |
| SOLUSDT | 2794 | 2490 | 2413 | 47.5% |

### marubozu-bearish

| Инструмент | Всего | Test | Test decided | Test accuracy |
|---|---|---|---|---|
| BNBUSDT | 195 | 185 | 181 | 50.8% |
| BTCUSDT | 150 | 139 | 139 | 50.4% |
| SOLUSDT | 109 | 105 | 100 | 50.0% |
| ETHUSDT | 94 | 89 | 89 | 47.2% |

### order-block-nested

| Инструмент | Всего | Test | Test decided | Test accuracy |
|---|---|---|---|---|
| BTCUSDT | 719 | 644 | 644 | 51.2% |
| ETHUSDT | 665 | 605 | 605 | 49.4% |
| BNBUSDT | 623 | 568 | 567 | 52.9% |
| SOLUSDT | 613 | 495 | 487 | 46.8% |

### fvg-breaker-block

| Инструмент | Всего | Test | Test decided | Test accuracy |
|---|---|---|---|---|
| BNBUSDT | 790 | 692 | 685 | 50.2% |
| SOLUSDT | 757 | 667 | 646 | 46.3% |
| BTCUSDT | 667 | 585 | 585 | 45.5% |
| ETHUSDT | 633 | 549 | 548 | 44.5% |

### fvg-nested

| Инструмент | Всего | Test | Test decided | Test accuracy |
|---|---|---|---|---|
| SOLUSDT | 5888 | 5253 | 5006 | 47.9% |
| BNBUSDT | 5421 | 4768 | 4721 | 47.0% |
| ETHUSDT | 5162 | 4603 | 4566 | 46.3% |
| BTCUSDT | 5029 | 4492 | 4491 | 48.7% |

### fvg-return

| Инструмент | Всего | Test | Test decided | Test accuracy |
|---|---|---|---|---|
| BTCUSDT | 19796 | 17411 | 17358 | 47.6% |
| BNBUSDT | 19789 | 17386 | 16558 | 48.4% |
| ETHUSDT | 18636 | 16239 | 15828 | 46.8% |
| SOLUSDT | 18592 | 16350 | 14423 | 47.4% |

### consolidation-breakout

| Инструмент | Всего | Test | Test decided | Test accuracy |
|---|---|---|---|---|
| BTCUSDT | 1281 | 1203 | 1195 | 47.0% |
| BNBUSDT | 1160 | 1062 | 999 | 48.3% |
| ETHUSDT | 948 | 865 | 850 | 47.1% |
| SOLUSDT | 924 | 845 | 750 | 44.8% |

### order-block-breaker

| Инструмент | Всего | Test | Test decided | Test accuracy |
|---|---|---|---|---|
| SOLUSDT | 1320 | 1138 | 1122 | 47.8% |
| ETHUSDT | 1271 | 1087 | 1086 | 45.4% |
| BTCUSDT | 1197 | 1040 | 1040 | 43.8% |
| BNBUSDT | 1115 | 968 | 966 | 47.1% |

### bullish-engulfing

| Инструмент | Всего | Test | Test decided | Test accuracy |
|---|---|---|---|---|
| ETHUSDT | 18 | 18 | 18 | 55.6% |
| SOLUSDT | 16 | 15 | 15 | 46.7% |
| BNBUSDT | 16 | 16 | 16 | 37.5% |
| BTCUSDT | 11 | 10 | 10 | 30.0% |

### impulse-breakout

| Инструмент | Всего | Test | Test decided | Test accuracy |
|---|---|---|---|---|
| BNBUSDT | 6065 | 5386 | 5245 | 46.8% |
| BTCUSDT | 5632 | 5008 | 5004 | 44.7% |
| SOLUSDT | 5494 | 4891 | 4530 | 44.9% |
| ETHUSDT | 5250 | 4638 | 4608 | 44.0% |

### pin-bar

| Инструмент | Всего | Test | Test decided | Test accuracy |
|---|---|---|---|---|
| BTCUSDT | 103 | 91 | 91 | 49.5% |
| BNBUSDT | 102 | 96 | 96 | 43.8% |
| ETHUSDT | 97 | 93 | 93 | 48.4% |
| SOLUSDT | 95 | 82 | 76 | 40.8% |

### marubozu-bullish

| Инструмент | Всего | Test | Test decided | Test accuracy |
|---|---|---|---|---|
| BNBUSDT | 225 | 207 | 202 | 50.5% |
| BTCUSDT | 138 | 131 | 131 | 45.0% |
| SOLUSDT | 134 | 126 | 121 | 45.5% |
| ETHUSDT | 89 | 83 | 83 | 41.0% |

### liquidity-sweep-reaction (reversal-at-key-level)

| Инструмент | Всего | Test | Test decided | Test accuracy |
|---|---|---|---|---|
| SOLUSDT | 18 | 15 | 15 | 53.3% |
| BTCUSDT | 15 | 12 | 12 | 25.0% |
| ETHUSDT | 11 | 11 | 11 | 45.5% |
| BNBUSDT | 11 | 10 | 10 | 30.0% |

### hanging-man

| Инструмент | Всего | Test | Test decided | Test accuracy |
|---|---|---|---|---|
| BNBUSDT | 35 | 35 | 34 | 58.8% |
| SOLUSDT | 19 | 19 | 19 | 63.2% |
| ETHUSDT | 3 | 3 | 3 | 66.7% |
| BTCUSDT | 1 | 1 | 1 | 0.0% |

### piercing-line

| Инструмент | Всего | Test | Test decided | Test accuracy |
|---|---|---|---|---|
| BNBUSDT | 6 | 4 | 0 | — |
| BTCUSDT | 3 | 2 | 0 | — |
| ETHUSDT | 3 | 2 | 0 | — |

### three-black-crows

| Инструмент | Всего | Test | Test decided | Test accuracy |
|---|---|---|---|---|
| SOLUSDT | 3 | 3 | 0 | — |
| BTCUSDT | 2 | 1 | 0 | — |
| ETHUSDT | 2 | 2 | 0 | — |
| BNBUSDT | 1 | 1 | 0 | — |

### morning-star

| Инструмент | Всего | Test | Test decided | Test accuracy |
|---|---|---|---|---|
| BTCUSDT | 3 | 3 | 0 | — |
| SOLUSDT | 1 | 1 | 0 | — |
| BNBUSDT | 1 | 1 | 0 | — |

### three-white-soldiers

| Инструмент | Всего | Test | Test decided | Test accuracy |
|---|---|---|---|---|
| ETHUSDT | 6 | 6 | 0 | — |
| BNBUSDT | 4 | 4 | 0 | — |
| SOLUSDT | 3 | 2 | 0 | — |
| BTCUSDT | 2 | 2 | 0 | — |

### dark-cloud-cover

| Инструмент | Всего | Test | Test decided | Test accuracy |
|---|---|---|---|---|
| BTCUSDT | 5 | 5 | 0 | — |
| BNBUSDT | 3 | 3 | 0 | — |
| ETHUSDT | 2 | 2 | 0 | — |
| SOLUSDT | 1 | 1 | 0 | — |

### liquidity-sweep (continuation)

| Инструмент | Всего | Test | Test decided | Test accuracy |
|---|---|---|---|---|
| BNBUSDT | 5 | 4 | 0 | — |
| SOLUSDT | 3 | 3 | 0 | — |
| BTCUSDT | 2 | 2 | 0 | — |
| ETHUSDT | 2 | 2 | 0 | — |

### liquidity-sweep-reaction (continuation)

| Инструмент | Всего | Test | Test decided | Test accuracy |
|---|---|---|---|---|
| ETHUSDT | 1 | 0 | 0 | — |
| BNBUSDT | 1 | 1 | 0 | — |

### evening-star

| Инструмент | Всего | Test | Test decided | Test accuracy |
|---|---|---|---|---|
| SOLUSDT | 2 | 1 | 0 | — |
| BNBUSDT | 1 | 1 | 0 | — |

### falling-three-methods

| Инструмент | Всего | Test | Test decided | Test accuracy |
|---|---|---|---|---|
| BNBUSDT | 1 | 1 | 0 | — |

## Детализация по горизонтам

### liquidity-sweep (reversal-at-key-level)

| Expiry bars | Train+Val accuracy | Test accuracy | Test decided |
|---|---|---|---|
| 1 | 41.1% | 54.0% | 352 |
| 2 | 38.2% | 49.2% | 354 |
| 3 | 28.1% | 49.2% | 360 |

### harmonic-pattern

| Expiry bars | Train+Val accuracy | Test accuracy | Test decided |
|---|---|---|---|
| 10 | 55.4% | 51.3% | 10717 |
| 20 | 59.1% | 53.3% | 10768 |
| 30 | 60.4% | 53.2% | 10792 |

### shooting-star

| Expiry bars | Train+Val accuracy | Test accuracy | Test decided |
|---|---|---|---|
| 1 | 42.9% | 52.4% | 1182 |
| 2 | 50.0% | 51.3% | 1253 |
| 3 | 45.1% | 52.3% | 1288 |
| 5 | 44.2% | 51.4% | 1297 |

### bullish-harami

| Expiry bars | Train+Val accuracy | Test accuracy | Test decided |
|---|---|---|---|
| 2 | 50.0% | 41.7% | 72 |
| 3 | 62.5% | 44.4% | 72 |
| 5 | 62.5% | 50.7% | 71 |
| 10 | 37.5% | 43.1% | 72 |

### bearish-engulfing

| Expiry bars | Train+Val accuracy | Test accuracy | Test decided |
|---|---|---|---|
| 1 | 45.5% | 51.0% | 49 |
| 2 | 45.5% | 51.0% | 49 |
| 3 | 54.5% | 55.1% | 49 |
| 5 | 45.5% | 60.0% | 50 |

### hammer

| Expiry bars | Train+Val accuracy | Test accuracy | Test decided |
|---|---|---|---|
| 1 | 0.0% | 52.7% | 55 |
| 2 | 0.0% | 56.3% | 64 |
| 3 | 0.0% | 53.8% | 65 |
| 5 | 0.0% | 54.3% | 70 |

### strong-order-block-reaction

| Expiry bars | Train+Val accuracy | Test accuracy | Test decided |
|---|---|---|---|
| 1 | 49.4% | 49.0% | 37849 |
| 2 | 48.6% | 48.6% | 38747 |
| 3 | 48.3% | 48.6% | 38959 |
| 5 | 48.5% | 48.5% | 39204 |
| 10 | 49.9% | 48.1% | 39321 |
| 20 | 49.9% | 47.7% | 39449 |
| 30 | 48.6% | 47.5% | 39486 |

### inside-bar

| Expiry bars | Train+Val accuracy | Test accuracy | Test decided |
|---|---|---|---|
| 1 | 47.9% | 48.9% | 83202 |
| 2 | 47.0% | 48.1% | 85730 |
| 3 | 47.9% | 48.4% | 86505 |
| 5 | 48.5% | 48.1% | 87181 |

### bearish-harami

| Expiry bars | Train+Val accuracy | Test accuracy | Test decided |
|---|---|---|---|
| 2 | 50.0% | 52.8% | 72 |
| 3 | 75.0% | 50.0% | 72 |
| 5 | 37.5% | 56.2% | 73 |
| 10 | 87.5% | 44.4% | 72 |

### inverted-hammer

| Expiry bars | Train+Val accuracy | Test accuracy | Test decided |
|---|---|---|---|
| 1 | 50.0% | 53.4% | 58 |
| 2 | 100.0% | 58.2% | 67 |
| 3 | 100.0% | 54.4% | 68 |
| 5 | 100.0% | 54.8% | 73 |

### order-block-continuation

| Expiry bars | Train+Val accuracy | Test accuracy | Test decided |
|---|---|---|---|
| 5 | 49.6% | 47.2% | 10886 |
| 10 | 47.5% | 48.1% | 10927 |
| 20 | 47.1% | 47.7% | 10949 |
| 30 | 47.3% | 48.4% | 10965 |

### marubozu-bearish

| Expiry bars | Train+Val accuracy | Test accuracy | Test decided |
|---|---|---|---|
| 1 | 55.2% | 46.2% | 500 |
| 2 | 60.0% | 49.9% | 509 |
| 3 | 62.1% | 50.1% | 513 |

### order-block-nested

| Expiry bars | Train+Val accuracy | Test accuracy | Test decided |
|---|---|---|---|
| 5 | 53.7% | 49.9% | 2285 |
| 10 | 54.1% | 49.0% | 2291 |
| 20 | 57.5% | 50.0% | 2298 |
| 30 | 58.6% | 50.2% | 2303 |

### fvg-breaker-block

| Expiry bars | Train+Val accuracy | Test accuracy | Test decided |
|---|---|---|---|
| 5 | 45.9% | 46.8% | 2464 |
| 10 | 44.4% | 46.1% | 2469 |
| 20 | 43.8% | 45.6% | 2470 |
| 30 | 43.8% | 45.7% | 2480 |

### fvg-nested

| Expiry bars | Train+Val accuracy | Test accuracy | Test decided |
|---|---|---|---|
| 5 | 48.9% | 47.5% | 18784 |
| 10 | 50.0% | 46.3% | 18874 |
| 20 | 44.6% | 46.6% | 18964 |
| 30 | 43.5% | 46.8% | 18960 |

### fvg-return

| Expiry bars | Train+Val accuracy | Test accuracy | Test decided |
|---|---|---|---|
| 1 | 48.3% | 47.6% | 64167 |
| 2 | 47.0% | 47.0% | 65708 |
| 3 | 46.8% | 46.8% | 66147 |
| 5 | 46.7% | 46.4% | 66459 |
| 10 | 45.6% | 45.4% | 66699 |
| 20 | 44.8% | 45.5% | 66912 |
| 30 | 43.8% | 45.9% | 67015 |

### consolidation-breakout

| Expiry bars | Train+Val accuracy | Test accuracy | Test decided |
|---|---|---|---|
| 1 | 54.9% | 46.9% | 3794 |
| 2 | 48.4% | 44.8% | 3890 |
| 3 | 48.8% | 45.5% | 3919 |
| 5 | 47.6% | 45.3% | 3919 |

### order-block-breaker

| Expiry bars | Train+Val accuracy | Test accuracy | Test decided |
|---|---|---|---|
| 5 | 41.9% | 45.6% | 4164 |
| 10 | 41.6% | 45.2% | 4197 |
| 20 | 42.8% | 46.2% | 4206 |
| 30 | 45.4% | 46.0% | 4214 |

### bullish-engulfing

| Expiry bars | Train+Val accuracy | Test accuracy | Test decided |
|---|---|---|---|
| 1 | 50.0% | 44.1% | 59 |
| 2 | 100.0% | 39.0% | 59 |
| 3 | 100.0% | 36.2% | 58 |
| 5 | 100.0% | 37.9% | 58 |

### impulse-breakout

| Expiry bars | Train+Val accuracy | Test accuracy | Test decided |
|---|---|---|---|
| 1 | 45.1% | 45.1% | 19387 |
| 2 | 44.7% | 44.5% | 19578 |
| 3 | 43.3% | 44.6% | 19663 |

### pin-bar

| Expiry bars | Train+Val accuracy | Test accuracy | Test decided |
|---|---|---|---|
| 1 | 47.1% | 45.8% | 356 |
| 2 | 42.9% | 46.4% | 358 |
| 3 | 40.0% | 44.4% | 360 |
| 5 | 31.4% | 43.1% | 360 |

### marubozu-bullish

| Expiry bars | Train+Val accuracy | Test accuracy | Test decided |
|---|---|---|---|
| 1 | 36.8% | 46.6% | 537 |
| 2 | 43.6% | 44.3% | 539 |
| 3 | 51.3% | 40.4% | 540 |

### liquidity-sweep-reaction (reversal-at-key-level)

| Expiry bars | Train+Val accuracy | Test accuracy | Test decided |
|---|---|---|---|
| 1 | 20.0% | 39.1% | 46 |
| 2 | 28.6% | 36.2% | 47 |
| 3 | 42.9% | 39.6% | 48 |

### hanging-man

| Expiry bars | Train+Val accuracy | Test accuracy | Test decided |
|---|---|---|---|
| 1 | 0.0% | 51.1% | 45 |
| 2 | 0.0% | 59.6% | 57 |
| 3 | 0.0% | 59.3% | 54 |
| 5 | 0.0% | 54.5% | 55 |

### piercing-line

| Expiry bars | Train+Val accuracy | Test accuracy | Test decided |
|---|---|---|---|
| 1 | 75.0% | 37.5% | 8 |
| 2 | 75.0% | 50.0% | 8 |
| 3 | 75.0% | 50.0% | 8 |
| 5 | 100.0% | 62.5% | 8 |

### three-black-crows

| Expiry bars | Train+Val accuracy | Test accuracy | Test decided |
|---|---|---|---|
| 3 | 100.0% | 85.7% | 7 |
| 5 | 100.0% | 42.9% | 7 |
| 10 | 100.0% | 42.9% | 7 |

### morning-star

| Expiry bars | Train+Val accuracy | Test accuracy | Test decided |
|---|---|---|---|
| 3 | 0.0% | 60.0% | 5 |
| 5 | 0.0% | 40.0% | 5 |
| 10 | 0.0% | 40.0% | 5 |

### three-white-soldiers

| Expiry bars | Train+Val accuracy | Test accuracy | Test decided |
|---|---|---|---|
| 3 | 0.0% | 35.7% | 14 |
| 5 | 0.0% | 53.8% | 13 |
| 10 | 100.0% | 64.3% | 14 |

### dark-cloud-cover

| Expiry bars | Train+Val accuracy | Test accuracy | Test decided |
|---|---|---|---|
| 1 | 0.0% | 18.2% | 11 |
| 2 | 0.0% | 18.2% | 11 |
| 3 | 0.0% | 18.2% | 11 |
| 5 | 0.0% | 27.3% | 11 |

### liquidity-sweep (continuation)

| Expiry bars | Train+Val accuracy | Test accuracy | Test decided |
|---|---|---|---|
| 1 | 100.0% | 45.5% | 11 |
| 2 | 0.0% | 80.0% | 10 |
| 3 | 0.0% | 72.7% | 11 |

### liquidity-sweep-reaction (continuation)

| Expiry bars | Train+Val accuracy | Test accuracy | Test decided |
|---|---|---|---|
| 1 | 100.0% | 100.0% | 1 |
| 2 | 100.0% | 100.0% | 1 |
| 3 | 0.0% | 100.0% | 1 |

### evening-star

| Expiry bars | Train+Val accuracy | Test accuracy | Test decided |
|---|---|---|---|
| 3 | 0.0% | 0.0% | 2 |
| 5 | 0.0% | 0.0% | 2 |
| 10 | 0.0% | 0.0% | 2 |

### falling-three-methods

| Expiry bars | Train+Val accuracy | Test accuracy | Test decided |
|---|---|---|---|
| 10 | 0.0% | 0.0% | 1 |
| 20 | 0.0% | 0.0% | 1 |
| 30 | 0.0% | 0.0% | 1 |

## Разбивка по folds (walk-forward)

> Если `bestExpiryBars` заметно меняется между folds — это признак нестабильности выбора горизонта для этого паттерна, а не единственное "истинное" число. Итоговый `bestExpiryBars` в сводной таблице выше — мода (самый частый выбор) по всем оценённым folds.

### liquidity-sweep (reversal-at-key-level)

| Fold | Train count | Best expiry | Test decided | Test wins | Fold accuracy |
|---|---|---|---|---|---|
| 1 | 57 | 1 | 62 | 41 | 66.1% |
| 2 | 120 | 1 | 63 | 30 | 47.6% |
| 3 | 184 | 1 | 60 | 26 | 43.3% |
| 4 | 244 | 1 | 26 | 14 | 53.8% |
| 5 | 273 | 1 | 36 | 20 | 55.6% |
| 6 | 312 | 1 | 62 | 30 | 48.4% |
| 7 | 375 | 1 | 43 | 29 | 67.4% |

### harmonic-pattern

| Fold | Train count | Best expiry | Test decided | Test wins | Fold accuracy |
|---|---|---|---|---|---|
| 1 | 1637 | 30 | 1528 | 699 | 45.7% |
| 2 | 3155 | 30 | 1788 | 982 | 54.9% |
| 3 | 4968 | 30 | 1681 | 945 | 56.2% |
| 4 | 6653 | 30 | 1513 | 840 | 55.5% |
| 5 | 8170 | 30 | 1550 | 802 | 51.7% |
| 6 | 9710 | 30 | 1351 | 699 | 51.7% |
| 7 | 11094 | 30 | 1381 | 773 | 56.0% |

### shooting-star

| Fold | Train count | Best expiry | Test decided | Test wins | Fold accuracy |
|---|---|---|---|---|---|
| 1 | 52 | 2 | 127 | 60 | 47.2% |
| 2 | 190 | 3 | 189 | 87 | 46.0% |
| 3 | 386 | 1 | 116 | 57 | 49.1% |
| 4 | 512 | 3 | 90 | 54 | 60.0% |
| 5 | 607 | 2 | 262 | 145 | 55.3% |
| 6 | 892 | 3 | 381 | 191 | 50.1% |
| 7 | 1298 | 1 | 97 | 49 | 50.5% |

### bullish-harami

| Fold | Train count | Best expiry | Test decided | Test wins | Fold accuracy |
|---|---|---|---|---|---|
| 1 | 8 | пропущен (мало train) | 0 | 0 | — |
| 2 | 16 | пропущен (мало train) | 0 | 0 | — |
| 3 | 22 | пропущен (мало train) | 0 | 0 | — |
| 4 | 35 | 5 | 5 | 3 | 60.0% |
| 5 | 40 | 5 | 16 | 6 | 37.5% |
| 6 | 56 | 5 | 12 | 6 | 50.0% |
| 7 | 68 | 5 | 12 | 8 | 66.7% |

### bearish-engulfing

| Fold | Train count | Best expiry | Test decided | Test wins | Fold accuracy |
|---|---|---|---|---|---|
| 1 | 11 | пропущен (мало train) | 0 | 0 | — |
| 2 | 17 | пропущен (мало train) | 0 | 0 | — |
| 3 | 26 | пропущен (мало train) | 0 | 0 | — |
| 4 | 33 | 3 | 7 | 4 | 57.1% |
| 5 | 40 | 5 | 10 | 2 | 20.0% |
| 6 | 50 | 5 | 8 | 5 | 62.5% |
| 7 | 58 | 5 | 3 | 3 | 100.0% |

### hammer

| Fold | Train count | Best expiry | Test decided | Test wins | Fold accuracy |
|---|---|---|---|---|---|
| 1 | 0 | пропущен (мало train) | 0 | 0 | — |
| 2 | 3 | пропущен (мало train) | 0 | 0 | — |
| 3 | 8 | пропущен (мало train) | 0 | 0 | — |
| 4 | 11 | пропущен (мало train) | 0 | 0 | — |
| 5 | 11 | пропущен (мало train) | 0 | 0 | — |
| 6 | 29 | пропущен (мало train) | 0 | 0 | — |
| 7 | 71 | 2 | 2 | 1 | 50.0% |

### strong-order-block-reaction

| Fold | Train count | Best expiry | Test decided | Test wins | Fold accuracy |
|---|---|---|---|---|---|
| 1 | 5730 | 20 | 5579 | 2718 | 48.7% |
| 2 | 11351 | 10 | 5341 | 2426 | 45.4% |
| 3 | 16734 | 1 | 5604 | 2761 | 49.3% |
| 4 | 22548 | 1 | 5784 | 2832 | 49.0% |
| 5 | 28504 | 1 | 5132 | 2491 | 48.5% |
| 6 | 34004 | 1 | 4972 | 2477 | 49.8% |
| 7 | 39448 | 1 | 5826 | 2855 | 49.0% |

### inside-bar

| Fold | Train count | Best expiry | Test decided | Test wins | Fold accuracy |
|---|---|---|---|---|---|
| 1 | 10629 | 5 | 11430 | 5382 | 47.1% |
| 2 | 22264 | 5 | 12579 | 6136 | 48.8% |
| 3 | 35083 | 5 | 11625 | 5564 | 47.9% |
| 4 | 46870 | 5 | 11161 | 5304 | 47.5% |
| 5 | 58190 | 1 | 12695 | 6253 | 49.3% |
| 6 | 71940 | 1 | 13686 | 6986 | 51.0% |
| 7 | 87394 | 1 | 11540 | 5724 | 49.6% |

### bearish-harami

| Fold | Train count | Best expiry | Test decided | Test wins | Fold accuracy |
|---|---|---|---|---|---|
| 1 | 8 | пропущен (мало train) | 0 | 0 | — |
| 2 | 25 | пропущен (мало train) | 0 | 0 | — |
| 3 | 36 | 3 | 8 | 2 | 25.0% |
| 4 | 44 | 5 | 11 | 7 | 63.6% |
| 5 | 55 | 5 | 7 | 4 | 57.1% |
| 6 | 62 | 5 | 12 | 7 | 58.3% |
| 7 | 74 | 5 | 7 | 2 | 28.6% |

### inverted-hammer

| Fold | Train count | Best expiry | Test decided | Test wins | Fold accuracy |
|---|---|---|---|---|---|
| 1 | 2 | пропущен (мало train) | 0 | 0 | — |
| 2 | 5 | пропущен (мало train) | 0 | 0 | — |
| 3 | 10 | пропущен (мало train) | 0 | 0 | — |
| 4 | 13 | пропущен (мало train) | 0 | 0 | — |
| 5 | 13 | пропущен (мало train) | 0 | 0 | — |
| 6 | 32 | 5 | 43 | 21 | 48.8% |
| 7 | 76 | 2 | 2 | 1 | 50.0% |

### order-block-continuation

| Fold | Train count | Best expiry | Test decided | Test wins | Fold accuracy |
|---|---|---|---|---|---|
| 1 | 1433 | 5 | 1413 | 656 | 46.4% |
| 2 | 2865 | 10 | 1498 | 729 | 48.7% |
| 3 | 4377 | 10 | 1606 | 774 | 48.2% |
| 4 | 5992 | 10 | 1683 | 798 | 47.4% |
| 5 | 7687 | 10 | 1496 | 705 | 47.1% |
| 6 | 9200 | 10 | 1684 | 814 | 48.3% |
| 7 | 10902 | 10 | 1543 | 741 | 48.0% |

### marubozu-bearish

| Fold | Train count | Best expiry | Test decided | Test wins | Fold accuracy |
|---|---|---|---|---|---|
| 1 | 30 | 3 | 49 | 29 | 59.2% |
| 2 | 79 | 2 | 76 | 38 | 50.0% |
| 3 | 156 | 2 | 63 | 26 | 41.3% |
| 4 | 219 | 1 | 75 | 30 | 40.0% |
| 5 | 296 | 1 | 80 | 36 | 45.0% |
| 6 | 382 | 2 | 96 | 47 | 49.0% |
| 7 | 480 | 2 | 68 | 37 | 54.4% |

### order-block-nested

| Fold | Train count | Best expiry | Test decided | Test wins | Fold accuracy |
|---|---|---|---|---|---|
| 1 | 308 | 30 | 240 | 123 | 51.2% |
| 2 | 548 | 30 | 407 | 193 | 47.4% |
| 3 | 958 | 30 | 278 | 150 | 54.0% |
| 4 | 1239 | 30 | 412 | 217 | 52.7% |
| 5 | 1650 | 30 | 326 | 162 | 49.7% |
| 6 | 1979 | 20 | 281 | 129 | 45.9% |
| 7 | 2262 | 30 | 357 | 175 | 49.0% |

### fvg-breaker-block

| Fold | Train count | Best expiry | Test decided | Test wins | Fold accuracy |
|---|---|---|---|---|---|
| 1 | 354 | 5 | 327 | 148 | 45.3% |
| 2 | 684 | 5 | 347 | 155 | 44.7% |
| 3 | 1034 | 5 | 366 | 173 | 47.3% |
| 4 | 1407 | 5 | 345 | 162 | 47.0% |
| 5 | 1754 | 5 | 354 | 159 | 44.9% |
| 6 | 2110 | 5 | 394 | 200 | 50.8% |
| 7 | 2514 | 5 | 331 | 156 | 47.1% |

### fvg-nested

| Fold | Train count | Best expiry | Test decided | Test wins | Fold accuracy |
|---|---|---|---|---|---|
| 1 | 2384 | 10 | 3111 | 1291 | 41.5% |
| 2 | 5535 | 5 | 2867 | 1366 | 47.6% |
| 3 | 8443 | 5 | 2030 | 926 | 45.6% |
| 4 | 10497 | 5 | 2537 | 1197 | 47.2% |
| 5 | 13061 | 5 | 3002 | 1446 | 48.2% |
| 6 | 16119 | 5 | 3251 | 1647 | 50.7% |
| 7 | 19483 | 5 | 2001 | 948 | 47.4% |

### fvg-return

| Fold | Train count | Best expiry | Test decided | Test wins | Fold accuracy |
|---|---|---|---|---|---|
| 1 | 9421 | 1 | 9296 | 4325 | 46.5% |
| 2 | 19094 | 1 | 9035 | 4251 | 47.1% |
| 3 | 28656 | 1 | 9081 | 4375 | 48.2% |
| 4 | 38074 | 1 | 9425 | 4440 | 47.1% |
| 5 | 47782 | 1 | 9322 | 4375 | 46.9% |
| 6 | 57683 | 1 | 9486 | 4636 | 48.9% |
| 7 | 68000 | 1 | 8522 | 4135 | 48.5% |

### consolidation-breakout

| Fold | Train count | Best expiry | Test decided | Test wins | Fold accuracy |
|---|---|---|---|---|---|
| 1 | 338 | 1 | 467 | 229 | 49.0% |
| 2 | 816 | 1 | 501 | 244 | 48.7% |
| 3 | 1337 | 1 | 400 | 164 | 41.0% |
| 4 | 1744 | 1 | 460 | 208 | 45.2% |
| 5 | 2210 | 1 | 579 | 262 | 45.3% |
| 6 | 2828 | 1 | 893 | 417 | 46.7% |
| 7 | 3798 | 1 | 494 | 257 | 52.0% |

### order-block-breaker

| Fold | Train count | Best expiry | Test decided | Test wins | Fold accuracy |
|---|---|---|---|---|---|
| 1 | 670 | 30 | 590 | 264 | 44.7% |
| 2 | 1260 | 30 | 541 | 249 | 46.0% |
| 3 | 1803 | 30 | 662 | 305 | 46.1% |
| 4 | 2468 | 30 | 683 | 317 | 46.4% |
| 5 | 3153 | 30 | 522 | 236 | 45.2% |
| 6 | 3683 | 30 | 516 | 246 | 47.7% |
| 7 | 4201 | 30 | 700 | 323 | 46.1% |

### bullish-engulfing

| Fold | Train count | Best expiry | Test decided | Test wins | Fold accuracy |
|---|---|---|---|---|---|
| 1 | 2 | пропущен (мало train) | 0 | 0 | — |
| 2 | 15 | пропущен (мало train) | 0 | 0 | — |
| 3 | 24 | пропущен (мало train) | 0 | 0 | — |
| 4 | 33 | 1 | 4 | 2 | 50.0% |
| 5 | 37 | 1 | 6 | 3 | 50.0% |
| 6 | 43 | 1 | 12 | 8 | 66.7% |
| 7 | 55 | 1 | 6 | 0 | 0.0% |

### impulse-breakout

| Fold | Train count | Best expiry | Test decided | Test wins | Fold accuracy |
|---|---|---|---|---|---|
| 1 | 2518 | 1 | 2553 | 1193 | 46.7% |
| 2 | 5136 | 1 | 2815 | 1280 | 45.5% |
| 3 | 8019 | 1 | 2532 | 1112 | 43.9% |
| 4 | 10606 | 1 | 2859 | 1182 | 41.3% |
| 5 | 13503 | 1 | 2840 | 1252 | 44.1% |
| 6 | 16446 | 1 | 3220 | 1509 | 46.9% |
| 7 | 19811 | 1 | 2568 | 1222 | 47.6% |

### pin-bar

| Fold | Train count | Best expiry | Test decided | Test wins | Fold accuracy |
|---|---|---|---|---|---|
| 1 | 35 | 1 | 42 | 19 | 45.2% |
| 2 | 77 | 1 | 65 | 27 | 41.5% |
| 3 | 144 | 2 | 41 | 14 | 34.1% |
| 4 | 185 | 2 | 50 | 21 | 42.0% |
| 5 | 235 | 2 | 47 | 24 | 51.1% |
| 6 | 284 | 1 | 54 | 30 | 55.6% |
| 7 | 339 | 1 | 57 | 22 | 38.6% |

### marubozu-bullish

| Fold | Train count | Best expiry | Test decided | Test wins | Fold accuracy |
|---|---|---|---|---|---|
| 1 | 39 | 3 | 80 | 32 | 40.0% |
| 2 | 119 | 1 | 113 | 51 | 45.1% |
| 3 | 233 | 2 | 81 | 32 | 39.5% |
| 4 | 315 | 1 | 47 | 14 | 29.8% |
| 5 | 362 | 1 | 42 | 19 | 45.2% |
| 6 | 405 | 1 | 118 | 63 | 53.4% |
| 7 | 526 | 1 | 59 | 27 | 45.8% |

### liquidity-sweep-reaction (reversal-at-key-level)

| Fold | Train count | Best expiry | Test decided | Test wins | Fold accuracy |
|---|---|---|---|---|---|
| 1 | 7 | пропущен (мало train) | 0 | 0 | — |
| 2 | 14 | пропущен (мало train) | 0 | 0 | — |
| 3 | 19 | пропущен (мало train) | 0 | 0 | — |
| 4 | 26 | пропущен (мало train) | 0 | 0 | — |
| 5 | 29 | пропущен (мало train) | 0 | 0 | — |
| 6 | 36 | 3 | 10 | 5 | 50.0% |
| 7 | 46 | 1 | 8 | 2 | 25.0% |

### hanging-man

| Fold | Train count | Best expiry | Test decided | Test wins | Fold accuracy |
|---|---|---|---|---|---|
| 1 | 0 | пропущен (мало train) | 0 | 0 | — |
| 2 | 3 | пропущен (мало train) | 0 | 0 | — |
| 3 | 8 | пропущен (мало train) | 0 | 0 | — |
| 4 | 10 | пропущен (мало train) | 0 | 0 | — |
| 5 | 11 | пропущен (мало train) | 0 | 0 | — |
| 6 | 22 | пропущен (мало train) | 0 | 0 | — |
| 7 | 54 | 2 | 4 | 1 | 25.0% |
