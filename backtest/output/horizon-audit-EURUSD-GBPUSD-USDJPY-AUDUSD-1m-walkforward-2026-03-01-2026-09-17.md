# Horizon Audit — EURUSD, GBPUSD, USDJPY, AUDUSD 1m

> Сгенерировано: 2026-09-20T15:20:32.793Z
> Период: 2026-03-01 → 2026-09-17
> Инструменты (пул): EURUSD, GBPUSD, USDJPY, AUDUSD
> Источник: Deriv WebSocket (1m candles → resampled to 1m)
> Разбиение: walk-forward, 8 folds, purge 30 bars
> Минимальный порог (train+validation): 30 срабатываний
> Минимальный порог для теста значимости (test-выборка): 200 решённых исходов
> Значимость: точный двусторонний биномиальный тест против baseline=0.5, с поправкой Holm-Bonferroni, α = 0.05
> Wilson-критерий: нижняя граница 95% интервала Уилсона ≥ 0.500 (margin=0)
> **Вердикт** (схема 2): по ДЕДУПЛИЦИРОВАННЫМ независимым наблюдениям (--dedupe-scope=pool); Holm по дедуплицированному семейству; допуск ('valid') требует нижней границы Уилсона выше max(безубыточность, дрейф-baseline).
> Выплата (payout): 80% → безубыточная доля выигрышей 55.56%
> Индикаторы: --indicators=live (18 шт.); версия алгоритма occurrences: 5

**Загружено**: 803188 1m свечей (суммарно по пулу), 803188 1m свечей после ресэмплинга.

## Метаданные пула

| Инструмент | 1m свечей | 1m свечей |
|---|---|---|
| EURUSD | 200797 | 200797 |
| GBPUSD | 200797 | 200797 |
| USDJPY | 200797 | 200797 |
| AUDUSD | 200797 | 200797 |

> **Предупреждение о корреляции**: Пул содержит 4 инструментов. Корреляция между инструментами (особенно forex-парами с общей валютой и крипто-парами к USDT) может завышать эффективный размер выборки. Сырой p-value НЕ корректируется на межинструментную корреляцию — он оставлен только для сравнения с прошлыми отчётами. Вердикт строится по дедуплицированным наблюдениям с независимостью ПО ВСЕМУ ПУЛУ (--dedupe-scope=pool): сигналы разных инструментов в пределах горизонта считаются одним событием — это консервативная поправка на межинструментную корреляцию.

## Сводка

- Паттернов в сетке: 41
- **Вердикт valid** (дедуп. + Holm + Wilson + безубыточность 55.56%): **0**
- Вердикт rejected (значимо ХУЖЕ 50% на независимых наблюдениях): 3
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
| liquidity-sweep | reversal-at-key-level | 304 | 1020 | 223 | 289 | 208 | 3 | 54.7% | 0.1803 | 53.4% | 0.3674 | нет | нет | 48.2% | 46.6% | 55.6% | no-evidence (not distinguishable from baseline (deduplicated)) | OK |
| bullish-harami | — | 68 | 178 | 36 | — | — | 5 | 52.8% | — | — | — | — | — | 37.0% | — | — | — | недостаточно данных |
| shooting-star | — | 992 | 3037 | 879 | 889 | 785 | 3 | 51.2% | 0.5000 | 51.0% | 0.6173 | нет | нет | 47.9% | 47.5% | 55.6% | no-evidence (not distinguishable from baseline (deduplicated)) | OK |
| strong-order-block-reaction | — | 33382 | 116683 | 28230 | 5870 | 5012 | 10 | 50.0% | 0.9953 | 50.8% | 0.2526 | нет | нет | 49.4% | 49.4% | 55.6% | no-evidence (not distinguishable from baseline (deduplicated)) | OK |
| bearish-harami | — | 53 | 81 | 16 | — | — | 2 | 50.0% | — | — | — | — | — | 28.0% | — | — | — | недостаточно данных |
| order-block-nested | — | 2296 | 8312 | 1888 | 920 | 759 | 20 | 49.5% | 0.6619 | 49.1% | 0.6632 | нет | нет | 47.2% | 45.6% | 55.6% | no-evidence (not distinguishable from baseline (deduplicated)) | OK |
| order-block-breaker | — | 4302 | 15334 | 3579 | 2645 | 2190 | 5 | 48.3% | 0.0382 | 49.0% | 0.3582 | нет | нет | 46.6% | 46.9% | 55.6% | no-evidence (not distinguishable from baseline (deduplicated)) | OK (значимо ХУЖЕ 50%) |
| fvg-nested | — | 10967 | 38730 | 9433 | 2515 | 2157 | 20 | 49.1% | 0.0874 | 49.0% | 0.3434 | нет | нет | 48.1% | 46.9% | 55.6% | no-evidence (not distinguishable from baseline (deduplicated)) | OK |
| fvg-return | — | 45294 | 157411 | 36739 | 6574 | 5346 | 1 | 48.6% | 0.0000 | 48.7% | 0.0538 | нет | нет | 48.1% | 47.3% | 55.6% | no-evidence (not distinguishable from baseline (deduplicated)) | OK (значимо ХУЖЕ 50%) |
| order-block-continuation | — | 7989 | 28420 | 6817 | 3260 | 2793 | 30 | 48.9% | 0.0656 | 48.5% | 0.1207 | нет | нет | 47.7% | 46.7% | 55.6% | no-evidence (not distinguishable from baseline (deduplicated)) | OK |
| inside-bar | — | 65831 | 224563 | 56073 | 33531 | 28158 | 5 | 48.6% | 0.0000 | 48.4% | 0.0000 | нет | нет | 48.2% | 47.8% | 55.6% | rejected (significant below baseline (deduplicated)) | OK (значимо ХУЖЕ 50%) |
| fvg-breaker-block | — | 2062 | 7195 | 1735 | 1544 | 1294 | 5 | 47.6% | 0.0490 | 48.4% | 0.2544 | нет | нет | 45.3% | 45.7% | 55.6% | no-evidence (not distinguishable from baseline (deduplicated)) | OK (значимо ХУЖЕ 50%) |
| marubozu-bullish | — | 493 | 1679 | 419 | 438 | 372 | 2 | 48.2% | 0.4941 | 47.6% | 0.3781 | нет | нет | 43.5% | 42.6% | 55.6% | no-evidence (not distinguishable from baseline (deduplicated)) | OK |
| harmonic-pattern | — | 7836 | 28902 | 6766 | 714 | 618 | 30 | 51.9% | 0.0023 | 47.2% | 0.1843 | да | нет | 50.7% | 43.3% | 55.6% | no-evidence (not distinguishable from baseline (deduplicated)) | OK |
| pin-bar | — | 444 | 1515 | 378 | 396 | 335 | 3 | 47.4% | 0.3284 | 46.9% | 0.2745 | нет | нет | 42.4% | 41.6% | 55.6% | no-evidence (not distinguishable from baseline (deduplicated)) | OK |
| marubozu-bearish | — | 464 | 1543 | 386 | 402 | 330 | 1 | 45.1% | 0.0595 | 46.4% | 0.2054 | нет | нет | 40.2% | 41.1% | 55.6% | no-evidence (not distinguishable from baseline (deduplicated)) | OK |
| impulse-breakout | — | 17718 | 61404 | 15075 | 11431 | 9637 | 3 | 45.3% | 0.0000 | 45.5% | 0.0000 | нет | нет | 44.5% | 44.5% | 55.6% | rejected (significant below baseline (deduplicated)) | OK (значимо ХУЖЕ 50%) |
| bearish-engulfing | — | 64 | 172 | 33 | — | — | 5 | 45.5% | — | — | — | — | — | 29.8% | — | — | — | недостаточно данных |
| consolidation-breakout | — | 2489 | 8383 | 2142 | 1919 | 1664 | 2 | 45.0% | 0.0000 | 45.4% | 0.0002 | нет | нет | 42.9% | 43.0% | 55.6% | rejected (significant below baseline (deduplicated)) | OK (значимо ХУЖЕ 50%) |
| bullish-engulfing | — | 53 | 117 | 20 | — | — | 1 | 45.0% | — | — | — | — | — | 25.8% | — | — | — | недостаточно данных |
| liquidity-sweep-reaction | reversal-at-key-level | 46 | 73 | 12 | — | — | 3 | 41.7% | — | — | — | — | — | 19.3% | — | — | — | недостаточно данных |
| inverted-hammer | — | 17 | 3 | 14 | — | — | — | — | — | — | — | — | — | — | — | — | — | недостаточно данных |
| hammer | — | 17 | 2 | 15 | — | — | — | — | — | — | — | — | — | — | — | — | — | недостаточно данных |
| dark-cloud-cover | — | 12 | 2 | 10 | — | — | — | — | — | — | — | — | — | — | — | — | — | недостаточно данных |
| piercing-line | — | 5 | 1 | 4 | — | — | — | — | — | — | — | — | — | — | — | — | — | недостаточно данных |
| three-black-crows | — | 2 | 1 | 1 | — | — | — | — | — | — | — | — | — | — | — | — | — | недостаточно данных |
| three-white-soldiers | — | 5 | 0 | 5 | — | — | — | — | — | — | — | — | — | — | — | — | — | недостаточно данных |
| hanging-man | — | 12 | 0 | 12 | — | — | — | — | — | — | — | — | — | — | — | — | — | недостаточно данных |
| evening-star | — | 3 | 0 | 3 | — | — | — | — | — | — | — | — | — | — | — | — | — | недостаточно данных |
| liquidity-sweep-reaction | continuation | 5 | 0 | 5 | — | — | — | — | — | — | — | — | — | — | — | — | — | недостаточно данных |
| liquidity-sweep | continuation | 9 | 1 | 8 | — | — | — | — | — | — | — | — | — | — | — | — | — | недостаточно данных |
| morning-star | — | 1 | 0 | 1 | — | — | — | — | — | — | — | — | — | — | — | — | — | недостаточно данных |
| rising-three-methods | — | 1 | 0 | 1 | — | — | — | — | — | — | — | — | — | — | — | — | — | недостаточно данных |
| mean-reversion | — | 0 | 0 | 0 | — | — | — | — | — | — | — | — | — | — | — | — | — | нет срабатываний |
| macd-deceleration-continuation | — | 0 | 0 | 0 | — | — | — | — | — | — | — | — | — | — | — | — | — | нет срабатываний |
| fvg-rejection | — | 0 | 0 | 0 | — | — | — | — | — | — | — | — | — | — | — | — | — | нет срабатываний |
| tweezer-bottom | — | 0 | 0 | 0 | — | — | — | — | — | — | — | — | — | — | — | — | — | нет срабатываний |
| tweezer-top | — | 0 | 0 | 0 | — | — | — | — | — | — | — | — | — | — | — | — | — | нет срабатываний |
| abandoned-baby-bottom | — | 0 | 0 | 0 | — | — | — | — | — | — | — | — | — | — | — | — | — | нет срабатываний |
| abandoned-baby-top | — | 0 | 0 | 0 | — | — | — | — | — | — | — | — | — | — | — | — | — | нет срабатываний |
| falling-three-methods | — | 0 | 0 | 0 | — | — | — | — | — | — | — | — | — | — | — | — | — | нет срабатываний |

## Воронка гейтов (инструментированные детекторы)

> Сколько баров дошло до каждого этапа детектора; разница соседних строк — отсев на этом гейте. Покрыты только детекторы с вызовами `gate()` (hammer, inverted-hammer, hanging-man, shooting-star, mean-reversion); остальные в воронке не участвуют. Счётчики — суммарно по пулу, за весь период (не только test).

### hammer

| Этап (кандидат дошёл до) | Дошло | % от вызовов | Отсеяно на этом гейте |
|---|---|---|---|
| 00-evaluated | 801068 | 100.000% | — |
| 01-context | 463383 | 57.846% | 337685 |
| 02-session | 282138 | 35.220% | 181245 |
| 03-rsi | 81780 | 10.209% | 200358 |
| 04-geometry | 3118 | 0.389% | 78662 |
| 05-confirmation | 783 | 0.098% | 2335 |
| 06-confidence | 17 | 0.002% | 766 |

### hanging-man

| Этап (кандидат дошёл до) | Дошло | % от вызовов | Отсеяно на этом гейте |
|---|---|---|---|
| 00-evaluated | 801068 | 100.000% | — |
| 01-context | 466885 | 58.283% | 334183 |
| 02-session | 285979 | 35.700% | 180906 |
| 03-rsi | 85510 | 10.674% | 200469 |
| 04-geometry | 3271 | 0.408% | 82239 |
| 05-confirmation | 763 | 0.095% | 2508 |
| 06-confidence | 12 | 0.001% | 751 |

### inverted-hammer

| Этап (кандидат дошёл до) | Дошло | % от вызовов | Отсеяно на этом гейте |
|---|---|---|---|
| 00-evaluated | 801068 | 100.000% | — |
| 01-context | 463383 | 57.846% | 337685 |
| 02-session | 282138 | 35.220% | 181245 |
| 03-rsi | 81780 | 10.209% | 200358 |
| 04-geometry | 3267 | 0.408% | 78513 |
| 05-confirmation | 798 | 0.100% | 2469 |
| 06-confidence | 17 | 0.002% | 781 |

### mean-reversion

| Этап (кандидат дошёл до) | Дошло | % от вызовов | Отсеяно на этом гейте |
|---|---|---|---|
| 00-evaluated | 801068 | 100.000% | — |
| 01-indicators | 801068 | 100.000% | 0 |
| 02-no-bos-block | 798757 | 99.712% | 2311 |
| 03-adx | 471179 | 58.819% | 327578 |
| 04-bar-geometry | 55968 | 6.987% | 415211 |
| 05-band-exit-rsi | 28 | 0.003% | 55940 |

### shooting-star

| Этап (кандидат дошёл до) | Дошло | % от вызовов | Отсеяно на этом гейте |
|---|---|---|---|
| 00-evaluated | 801068 | 100.000% | — |
| 01-context | 466885 | 58.283% | 334183 |
| 02-session | 266886 | 33.316% | 199999 |
| 04-geometry | 10574 | 1.320% | 256312 |
| 05-confirmation | 4948 | 0.618% | 5626 |
| 06-confidence | 992 | 0.124% | 3956 |


## Разбивка по инструментам

### liquidity-sweep (reversal-at-key-level)

| Инструмент | Всего | Test | Test decided | Test accuracy |
|---|---|---|---|---|
| USDJPY | 111 | 101 | 99 | 61.6% |
| EURUSD | 71 | 61 | 60 | 50.0% |
| GBPUSD | 63 | 58 | 58 | 51.7% |
| AUDUSD | 59 | 55 | 50 | 66.0% |

### bullish-harami

| Инструмент | Всего | Test | Test decided | Test accuracy |
|---|---|---|---|---|
| USDJPY | 21 | 20 | 20 | 75.0% |
| GBPUSD | 17 | 16 | 15 | 73.3% |
| AUDUSD | 16 | 14 | 14 | 50.0% |
| EURUSD | 14 | 9 | 9 | 11.1% |

### shooting-star

| Инструмент | Всего | Test | Test decided | Test accuracy |
|---|---|---|---|---|
| AUDUSD | 315 | 304 | 283 | 55.8% |
| EURUSD | 264 | 249 | 235 | 53.2% |
| USDJPY | 234 | 213 | 201 | 49.8% |
| GBPUSD | 179 | 160 | 150 | 50.7% |

### strong-order-block-reaction

| Инструмент | Всего | Test | Test decided | Test accuracy |
|---|---|---|---|---|
| AUDUSD | 8532 | 7427 | 7257 | 50.9% |
| GBPUSD | 8376 | 7251 | 7109 | 48.9% |
| EURUSD | 8324 | 7178 | 7027 | 50.9% |
| USDJPY | 8150 | 7058 | 6921 | 51.1% |

### bearish-harami

| Инструмент | Всего | Test | Test decided | Test accuracy |
|---|---|---|---|---|
| USDJPY | 20 | 19 | 19 | 63.2% |
| GBPUSD | 15 | 14 | 13 | 53.8% |
| EURUSD | 11 | 10 | 9 | 77.8% |
| AUDUSD | 7 | 7 | 6 | 33.3% |

### order-block-nested

| Инструмент | Всего | Test | Test decided | Test accuracy |
|---|---|---|---|---|
| EURUSD | 658 | 552 | 544 | 52.2% |
| GBPUSD | 573 | 483 | 477 | 50.9% |
| AUDUSD | 536 | 470 | 464 | 42.9% |
| USDJPY | 529 | 407 | 403 | 51.6% |

### order-block-breaker

| Инструмент | Всего | Test | Test decided | Test accuracy |
|---|---|---|---|---|
| AUDUSD | 1148 | 985 | 951 | 48.3% |
| GBPUSD | 1077 | 940 | 917 | 45.4% |
| EURUSD | 1055 | 907 | 878 | 52.4% |
| USDJPY | 1022 | 838 | 812 | 50.2% |

### fvg-nested

| Инструмент | Всего | Test | Test decided | Test accuracy |
|---|---|---|---|---|
| EURUSD | 2864 | 2490 | 2463 | 51.6% |
| GBPUSD | 2731 | 2367 | 2334 | 48.5% |
| USDJPY | 2723 | 2425 | 2390 | 46.1% |
| AUDUSD | 2649 | 2324 | 2283 | 51.6% |

### fvg-return

| Инструмент | Всего | Test | Test decided | Test accuracy |
|---|---|---|---|---|
| USDJPY | 11724 | 10266 | 9427 | 48.7% |
| GBPUSD | 11580 | 10100 | 9407 | 49.0% |
| EURUSD | 11322 | 9963 | 9052 | 48.5% |
| AUDUSD | 10668 | 9362 | 8584 | 48.6% |

### order-block-continuation

| Инструмент | Всего | Test | Test decided | Test accuracy |
|---|---|---|---|---|
| USDJPY | 2071 | 1771 | 1755 | 46.4% |
| GBPUSD | 2026 | 1761 | 1740 | 50.5% |
| EURUSD | 2019 | 1722 | 1704 | 48.4% |
| AUDUSD | 1873 | 1631 | 1618 | 50.4% |

### inside-bar

| Инструмент | Всего | Test | Test decided | Test accuracy |
|---|---|---|---|---|
| EURUSD | 16923 | 14988 | 14430 | 48.7% |
| USDJPY | 16904 | 14883 | 14421 | 48.3% |
| AUDUSD | 16507 | 14776 | 14239 | 48.9% |
| GBPUSD | 15497 | 13692 | 13310 | 48.9% |

### fvg-breaker-block

| Инструмент | Всего | Test | Test decided | Test accuracy |
|---|---|---|---|---|
| USDJPY | 550 | 467 | 454 | 43.8% |
| EURUSD | 521 | 450 | 432 | 51.4% |
| GBPUSD | 496 | 441 | 431 | 49.0% |
| AUDUSD | 495 | 422 | 415 | 49.6% |

### marubozu-bullish

| Инструмент | Всего | Test | Test decided | Test accuracy |
|---|---|---|---|---|
| USDJPY | 160 | 145 | 142 | 49.3% |
| AUDUSD | 121 | 114 | 102 | 49.0% |
| GBPUSD | 117 | 99 | 97 | 57.7% |
| EURUSD | 95 | 81 | 78 | 46.2% |

### harmonic-pattern

| Инструмент | Всего | Test | Test decided | Test accuracy |
|---|---|---|---|---|
| USDJPY | 2230 | 1921 | 1898 | 53.2% |
| AUDUSD | 2102 | 1780 | 1761 | 53.9% |
| EURUSD | 1824 | 1631 | 1612 | 49.8% |
| GBPUSD | 1680 | 1510 | 1495 | 50.0% |

### pin-bar

| Инструмент | Всего | Test | Test decided | Test accuracy |
|---|---|---|---|---|
| USDJPY | 126 | 104 | 101 | 49.5% |
| AUDUSD | 122 | 107 | 103 | 40.8% |
| GBPUSD | 101 | 93 | 91 | 51.6% |
| EURUSD | 95 | 84 | 82 | 52.4% |

### marubozu-bearish

| Инструмент | Всего | Test | Test decided | Test accuracy |
|---|---|---|---|---|
| GBPUSD | 128 | 121 | 114 | 41.2% |
| EURUSD | 122 | 111 | 101 | 49.5% |
| AUDUSD | 114 | 101 | 93 | 50.5% |
| USDJPY | 100 | 82 | 73 | 39.7% |

### impulse-breakout

| Инструмент | Всего | Test | Test decided | Test accuracy |
|---|---|---|---|---|
| USDJPY | 4737 | 4203 | 4079 | 46.0% |
| GBPUSD | 4511 | 3966 | 3857 | 45.7% |
| EURUSD | 4332 | 3799 | 3675 | 45.8% |
| AUDUSD | 4138 | 3621 | 3485 | 45.3% |

### bearish-engulfing

| Инструмент | Всего | Test | Test decided | Test accuracy |
|---|---|---|---|---|
| GBPUSD | 19 | 18 | 18 | 44.4% |
| EURUSD | 17 | 14 | 14 | 57.1% |
| AUDUSD | 15 | 14 | 13 | 30.8% |
| USDJPY | 13 | 10 | 10 | 80.0% |

### consolidation-breakout

| Инструмент | Всего | Test | Test decided | Test accuracy |
|---|---|---|---|---|
| USDJPY | 941 | 871 | 819 | 44.7% |
| GBPUSD | 558 | 516 | 497 | 47.1% |
| EURUSD | 532 | 480 | 436 | 46.3% |
| AUDUSD | 458 | 418 | 397 | 45.6% |

### bullish-engulfing

| Инструмент | Всего | Test | Test decided | Test accuracy |
|---|---|---|---|---|
| AUDUSD | 17 | 16 | 15 | 46.7% |
| USDJPY | 14 | 13 | 13 | 76.9% |
| GBPUSD | 12 | 8 | 8 | 25.0% |
| EURUSD | 10 | 10 | 10 | 30.0% |

### liquidity-sweep-reaction (reversal-at-key-level)

| Инструмент | Всего | Test | Test decided | Test accuracy |
|---|---|---|---|---|
| USDJPY | 16 | 16 | 15 | 46.7% |
| GBPUSD | 13 | 12 | 12 | 50.0% |
| EURUSD | 9 | 8 | 8 | 87.5% |
| AUDUSD | 8 | 8 | 8 | 62.5% |

### inverted-hammer

| Инструмент | Всего | Test | Test decided | Test accuracy |
|---|---|---|---|---|
| AUDUSD | 8 | 7 | 0 | — |
| EURUSD | 6 | 5 | 0 | — |
| GBPUSD | 2 | 1 | 0 | — |
| USDJPY | 1 | 1 | 0 | — |

### hammer

| Инструмент | Всего | Test | Test decided | Test accuracy |
|---|---|---|---|---|
| AUDUSD | 8 | 7 | 0 | — |
| EURUSD | 6 | 5 | 0 | — |
| USDJPY | 2 | 2 | 0 | — |
| GBPUSD | 1 | 1 | 0 | — |

### dark-cloud-cover

| Инструмент | Всего | Test | Test decided | Test accuracy |
|---|---|---|---|---|
| EURUSD | 3 | 2 | 0 | — |
| GBPUSD | 3 | 2 | 0 | — |
| USDJPY | 3 | 3 | 0 | — |
| AUDUSD | 3 | 3 | 0 | — |

### piercing-line

| Инструмент | Всего | Test | Test decided | Test accuracy |
|---|---|---|---|---|
| EURUSD | 2 | 1 | 0 | — |
| GBPUSD | 1 | 1 | 0 | — |
| USDJPY | 1 | 1 | 0 | — |
| AUDUSD | 1 | 1 | 0 | — |

### three-black-crows

| Инструмент | Всего | Test | Test decided | Test accuracy |
|---|---|---|---|---|
| EURUSD | 1 | 1 | 0 | — |
| AUDUSD | 1 | 0 | 0 | — |

### three-white-soldiers

| Инструмент | Всего | Test | Test decided | Test accuracy |
|---|---|---|---|---|
| EURUSD | 3 | 3 | 0 | — |
| GBPUSD | 1 | 1 | 0 | — |
| USDJPY | 1 | 1 | 0 | — |

### hanging-man

| Инструмент | Всего | Test | Test decided | Test accuracy |
|---|---|---|---|---|
| AUDUSD | 7 | 7 | 0 | — |
| GBPUSD | 2 | 2 | 0 | — |
| USDJPY | 2 | 2 | 0 | — |
| EURUSD | 1 | 1 | 0 | — |

### evening-star

| Инструмент | Всего | Test | Test decided | Test accuracy |
|---|---|---|---|---|
| EURUSD | 1 | 1 | 0 | — |
| GBPUSD | 1 | 1 | 0 | — |
| AUDUSD | 1 | 1 | 0 | — |

### liquidity-sweep-reaction (continuation)

| Инструмент | Всего | Test | Test decided | Test accuracy |
|---|---|---|---|---|
| GBPUSD | 2 | 2 | 0 | — |
| EURUSD | 1 | 1 | 0 | — |
| USDJPY | 1 | 1 | 0 | — |
| AUDUSD | 1 | 1 | 0 | — |

### liquidity-sweep (continuation)

| Инструмент | Всего | Test | Test decided | Test accuracy |
|---|---|---|---|---|
| AUDUSD | 4 | 3 | 0 | — |
| USDJPY | 3 | 3 | 0 | — |
| GBPUSD | 2 | 2 | 0 | — |

### morning-star

| Инструмент | Всего | Test | Test decided | Test accuracy |
|---|---|---|---|---|
| USDJPY | 1 | 1 | 0 | — |

### rising-three-methods

| Инструмент | Всего | Test | Test decided | Test accuracy |
|---|---|---|---|---|
| USDJPY | 1 | 1 | 0 | — |

## Детализация по горизонтам

### liquidity-sweep (reversal-at-key-level)

| Expiry bars | Train+Val accuracy | Test accuracy | Test decided |
|---|---|---|---|
| 1 | 35.7% | 55.1% | 256 |
| 2 | 37.9% | 54.1% | 255 |
| 3 | 41.4% | 57.7% | 267 |

### bullish-harami

| Expiry bars | Train+Val accuracy | Test accuracy | Test decided |
|---|---|---|---|
| 2 | 66.7% | 57.4% | 54 |
| 3 | 66.7% | 51.9% | 54 |
| 5 | 66.7% | 58.6% | 58 |
| 10 | 88.9% | 58.6% | 58 |

### shooting-star

| Expiry bars | Train+Val accuracy | Test accuracy | Test decided |
|---|---|---|---|
| 1 | 44.3% | 49.3% | 845 |
| 2 | 54.7% | 50.3% | 864 |
| 3 | 47.7% | 52.8% | 869 |
| 5 | 39.4% | 49.9% | 894 |

### strong-order-block-reaction

| Expiry bars | Train+Val accuracy | Test accuracy | Test decided |
|---|---|---|---|
| 1 | 49.0% | 49.7% | 26622 |
| 2 | 49.0% | 49.6% | 27373 |
| 3 | 48.6% | 50.0% | 27735 |
| 5 | 49.6% | 50.4% | 27986 |
| 10 | 50.2% | 50.4% | 28314 |
| 20 | 50.1% | 50.2% | 28534 |
| 30 | 48.5% | 49.9% | 28577 |

### bearish-harami

| Expiry bars | Train+Val accuracy | Test accuracy | Test decided |
|---|---|---|---|
| 2 | 66.7% | 59.6% | 47 |
| 3 | 33.3% | 52.1% | 48 |
| 5 | 33.3% | 59.2% | 49 |
| 10 | 66.7% | 48.0% | 50 |

### order-block-nested

| Expiry bars | Train+Val accuracy | Test accuracy | Test decided |
|---|---|---|---|
| 5 | 51.3% | 50.3% | 1857 |
| 10 | 54.9% | 49.4% | 1870 |
| 20 | 55.1% | 49.5% | 1888 |
| 30 | 54.5% | 49.5% | 1890 |

### order-block-breaker

| Expiry bars | Train+Val accuracy | Test accuracy | Test decided |
|---|---|---|---|
| 5 | 51.1% | 49.0% | 3558 |
| 10 | 51.8% | 48.5% | 3600 |
| 20 | 48.2% | 48.6% | 3614 |
| 30 | 48.2% | 48.0% | 3629 |

### fvg-nested

| Expiry bars | Train+Val accuracy | Test accuracy | Test decided |
|---|---|---|---|
| 5 | 46.8% | 49.2% | 9309 |
| 10 | 44.5% | 49.2% | 9390 |
| 20 | 48.9% | 49.5% | 9470 |
| 30 | 44.7% | 50.0% | 9515 |

### fvg-return

| Expiry bars | Train+Val accuracy | Test accuracy | Test decided |
|---|---|---|---|
| 1 | 50.7% | 48.7% | 36470 |
| 2 | 51.1% | 48.2% | 37517 |
| 3 | 50.5% | 48.5% | 38016 |
| 5 | 49.6% | 48.4% | 38439 |
| 10 | 49.9% | 47.7% | 38854 |
| 20 | 49.8% | 47.4% | 39157 |
| 30 | 49.6% | 47.3% | 39250 |

### order-block-continuation

| Expiry bars | Train+Val accuracy | Test accuracy | Test decided |
|---|---|---|---|
| 5 | 50.6% | 47.7% | 6668 |
| 10 | 51.0% | 48.2% | 6737 |
| 20 | 50.0% | 47.8% | 6776 |
| 30 | 51.9% | 48.9% | 6817 |

### inside-bar

| Expiry bars | Train+Val accuracy | Test accuracy | Test decided |
|---|---|---|---|
| 1 | 49.1% | 48.3% | 53174 |
| 2 | 48.5% | 48.5% | 55050 |
| 3 | 48.5% | 48.6% | 55621 |
| 5 | 49.0% | 48.7% | 56400 |

### fvg-breaker-block

| Expiry bars | Train+Val accuracy | Test accuracy | Test decided |
|---|---|---|---|
| 5 | 52.9% | 48.4% | 1732 |
| 10 | 50.0% | 48.4% | 1749 |
| 20 | 48.0% | 45.7% | 1761 |
| 30 | 50.2% | 46.4% | 1761 |

### marubozu-bullish

| Expiry bars | Train+Val accuracy | Test accuracy | Test decided |
|---|---|---|---|
| 1 | 50.0% | 46.5% | 415 |
| 2 | 49.1% | 50.6% | 419 |
| 3 | 47.2% | 47.8% | 418 |

### harmonic-pattern

| Expiry bars | Train+Val accuracy | Test accuracy | Test decided |
|---|---|---|---|
| 10 | 49.2% | 48.8% | 6696 |
| 20 | 48.7% | 50.8% | 6745 |
| 30 | 49.6% | 51.9% | 6766 |

### pin-bar

| Expiry bars | Train+Val accuracy | Test accuracy | Test decided |
|---|---|---|---|
| 1 | 38.2% | 46.5% | 361 |
| 2 | 50.0% | 46.4% | 379 |
| 3 | 48.1% | 48.3% | 377 |
| 5 | 52.7% | 47.0% | 381 |

### marubozu-bearish

| Expiry bars | Train+Val accuracy | Test accuracy | Test decided |
|---|---|---|---|
| 1 | 68.8% | 45.4% | 381 |
| 2 | 63.0% | 47.3% | 400 |
| 3 | 51.0% | 47.6% | 391 |

### impulse-breakout

| Expiry bars | Train+Val accuracy | Test accuracy | Test decided |
|---|---|---|---|
| 1 | 48.6% | 45.8% | 14666 |
| 2 | 49.2% | 45.8% | 15023 |
| 3 | 49.0% | 45.7% | 15096 |

### bearish-engulfing

| Expiry bars | Train+Val accuracy | Test accuracy | Test decided |
|---|---|---|---|
| 1 | 62.5% | 41.5% | 53 |
| 2 | 62.5% | 43.6% | 55 |
| 3 | 50.0% | 35.7% | 56 |
| 5 | 75.0% | 50.9% | 55 |

### consolidation-breakout

| Expiry bars | Train+Val accuracy | Test accuracy | Test decided |
|---|---|---|---|
| 1 | 49.0% | 43.0% | 2092 |
| 2 | 47.0% | 45.7% | 2149 |
| 3 | 46.9% | 44.6% | 2164 |
| 5 | 47.5% | 44.5% | 2201 |

### bullish-engulfing

| Expiry bars | Train+Val accuracy | Test accuracy | Test decided |
|---|---|---|---|
| 1 | 33.3% | 47.8% | 46 |
| 2 | 16.7% | 37.8% | 45 |
| 3 | 50.0% | 34.8% | 46 |
| 5 | 33.3% | 45.7% | 46 |

### liquidity-sweep-reaction (reversal-at-key-level)

| Expiry bars | Train+Val accuracy | Test accuracy | Test decided |
|---|---|---|---|
| 1 | 100.0% | 50.0% | 44 |
| 2 | 100.0% | 47.7% | 44 |
| 3 | 100.0% | 58.1% | 43 |

### inverted-hammer

| Expiry bars | Train+Val accuracy | Test accuracy | Test decided |
|---|---|---|---|
| 1 | 33.3% | 53.8% | 13 |
| 2 | 33.3% | 63.6% | 11 |
| 3 | 33.3% | 53.8% | 13 |
| 5 | 66.7% | 50.0% | 14 |

### hammer

| Expiry bars | Train+Val accuracy | Test accuracy | Test decided |
|---|---|---|---|
| 1 | 50.0% | 60.0% | 15 |
| 2 | 50.0% | 69.2% | 13 |
| 3 | 50.0% | 53.8% | 13 |
| 5 | 50.0% | 60.0% | 15 |

### dark-cloud-cover

| Expiry bars | Train+Val accuracy | Test accuracy | Test decided |
|---|---|---|---|
| 1 | 50.0% | 55.6% | 9 |
| 2 | 50.0% | 66.7% | 9 |
| 3 | 50.0% | 70.0% | 10 |
| 5 | 50.0% | 44.4% | 9 |

### piercing-line

| Expiry bars | Train+Val accuracy | Test accuracy | Test decided |
|---|---|---|---|
| 1 | 100.0% | 50.0% | 4 |
| 2 | 100.0% | 75.0% | 4 |
| 3 | 100.0% | 75.0% | 4 |
| 5 | 100.0% | 75.0% | 4 |

### three-black-crows

| Expiry bars | Train+Val accuracy | Test accuracy | Test decided |
|---|---|---|---|
| 3 | 0.0% | 0.0% | 1 |
| 5 | 0.0% | 0.0% | 1 |
| 10 | 0.0% | 0.0% | 1 |

### three-white-soldiers

| Expiry bars | Train+Val accuracy | Test accuracy | Test decided |
|---|---|---|---|
| 3 | 0.0% | 60.0% | 5 |
| 5 | 0.0% | 60.0% | 5 |
| 10 | 0.0% | 75.0% | 4 |

### hanging-man

| Expiry bars | Train+Val accuracy | Test accuracy | Test decided |
|---|---|---|---|
| 1 | 0.0% | 58.3% | 12 |
| 2 | 0.0% | 75.0% | 12 |
| 3 | 0.0% | 63.6% | 11 |
| 5 | 0.0% | 91.7% | 12 |

### evening-star

| Expiry bars | Train+Val accuracy | Test accuracy | Test decided |
|---|---|---|---|
| 3 | 0.0% | 0.0% | 3 |
| 5 | 0.0% | 33.3% | 3 |
| 10 | 0.0% | 33.3% | 3 |

### liquidity-sweep-reaction (continuation)

| Expiry bars | Train+Val accuracy | Test accuracy | Test decided |
|---|---|---|---|
| 1 | 0.0% | 100.0% | 5 |
| 2 | 0.0% | 100.0% | 5 |
| 3 | 0.0% | 80.0% | 5 |

### liquidity-sweep (continuation)

| Expiry bars | Train+Val accuracy | Test accuracy | Test decided |
|---|---|---|---|
| 1 | 0.0% | 25.0% | 8 |
| 2 | 0.0% | 37.5% | 8 |
| 3 | 0.0% | 37.5% | 8 |

### morning-star

| Expiry bars | Train+Val accuracy | Test accuracy | Test decided |
|---|---|---|---|
| 3 | 0.0% | 0.0% | 1 |
| 5 | 0.0% | 0.0% | 1 |
| 10 | 0.0% | 0.0% | 1 |

### rising-three-methods

| Expiry bars | Train+Val accuracy | Test accuracy | Test decided |
|---|---|---|---|
| 10 | 0.0% | 100.0% | 1 |
| 20 | 0.0% | 0.0% | 1 |
| 30 | 0.0% | 0.0% | 1 |

## Разбивка по folds (walk-forward)

> Если `bestExpiryBars` заметно меняется между folds — это признак нестабильности выбора горизонта для этого паттерна, а не единственное "истинное" число. Итоговый `bestExpiryBars` в сводной таблице выше — мода (самый частый выбор) по всем оценённым folds.

### liquidity-sweep (reversal-at-key-level)

| Fold | Train count | Best expiry | Test decided | Test wins | Fold accuracy |
|---|---|---|---|---|---|
| 1 | 29 | пропущен (мало train) | 0 | 0 | — |
| 2 | 69 | 1 | 46 | 26 | 56.5% |
| 3 | 117 | 1 | 29 | 16 | 55.2% |
| 4 | 151 | 3 | 36 | 22 | 61.1% |
| 5 | 187 | 2 | 36 | 20 | 55.6% |
| 6 | 227 | 3 | 42 | 23 | 54.8% |
| 7 | 269 | 3 | 34 | 15 | 44.1% |

### bullish-harami

| Fold | Train count | Best expiry | Test decided | Test wins | Fold accuracy |
|---|---|---|---|---|---|
| 1 | 9 | пропущен (мало train) | 0 | 0 | — |
| 2 | 13 | пропущен (мало train) | 0 | 0 | — |
| 3 | 22 | пропущен (мало train) | 0 | 0 | — |
| 4 | 32 | 10 | 5 | 3 | 60.0% |
| 5 | 37 | 5 | 12 | 9 | 75.0% |
| 6 | 49 | 5 | 11 | 4 | 36.4% |
| 7 | 60 | 5 | 8 | 3 | 37.5% |

### shooting-star

| Fold | Train count | Best expiry | Test decided | Test wins | Fold accuracy |
|---|---|---|---|---|---|
| 1 | 66 | 2 | 107 | 55 | 51.4% |
| 2 | 176 | 2 | 111 | 47 | 42.3% |
| 3 | 290 | 3 | 128 | 74 | 57.8% |
| 4 | 425 | 3 | 123 | 58 | 47.2% |
| 5 | 556 | 3 | 131 | 75 | 57.3% |
| 6 | 697 | 3 | 122 | 67 | 54.9% |
| 7 | 827 | 3 | 157 | 74 | 47.1% |

### strong-order-block-reaction

| Fold | Train count | Best expiry | Test decided | Test wins | Fold accuracy |
|---|---|---|---|---|---|
| 1 | 4468 | 10 | 3636 | 1914 | 52.6% |
| 2 | 8153 | 10 | 4335 | 2215 | 51.1% |
| 3 | 12580 | 10 | 4050 | 1897 | 46.8% |
| 4 | 16727 | 5 | 4112 | 2046 | 49.8% |
| 5 | 20966 | 20 | 3778 | 1924 | 50.9% |
| 6 | 24784 | 10 | 4114 | 2046 | 49.7% |
| 7 | 29005 | 5 | 4205 | 2074 | 49.3% |

### bearish-harami

| Fold | Train count | Best expiry | Test decided | Test wins | Fold accuracy |
|---|---|---|---|---|---|
| 1 | 3 | пропущен (мало train) | 0 | 0 | — |
| 2 | 10 | пропущен (мало train) | 0 | 0 | — |
| 3 | 15 | пропущен (мало train) | 0 | 0 | — |
| 4 | 22 | пропущен (мало train) | 0 | 0 | — |
| 5 | 26 | пропущен (мало train) | 0 | 0 | — |
| 6 | 36 | 2 | 9 | 4 | 44.4% |
| 7 | 45 | 2 | 7 | 4 | 57.1% |

### order-block-nested

| Fold | Train count | Best expiry | Test decided | Test wins | Fold accuracy |
|---|---|---|---|---|---|
| 1 | 384 | 20 | 206 | 98 | 47.6% |
| 2 | 591 | 20 | 304 | 156 | 51.3% |
| 3 | 905 | 20 | 307 | 161 | 52.4% |
| 4 | 1216 | 20 | 249 | 125 | 50.2% |
| 5 | 1467 | 20 | 287 | 145 | 50.5% |
| 6 | 1755 | 20 | 234 | 124 | 53.0% |
| 7 | 1994 | 20 | 301 | 125 | 41.5% |

### order-block-breaker

| Fold | Train count | Best expiry | Test decided | Test wins | Fold accuracy |
|---|---|---|---|---|---|
| 1 | 632 | 10 | 499 | 245 | 49.1% |
| 2 | 1139 | 5 | 509 | 243 | 47.7% |
| 3 | 1659 | 10 | 515 | 242 | 47.0% |
| 4 | 2180 | 10 | 545 | 264 | 48.4% |
| 5 | 2741 | 5 | 472 | 238 | 50.4% |
| 6 | 3234 | 5 | 502 | 248 | 49.4% |
| 7 | 3749 | 5 | 537 | 247 | 46.0% |

### fvg-nested

| Fold | Train count | Best expiry | Test decided | Test wins | Fold accuracy |
|---|---|---|---|---|---|
| 1 | 1340 | 20 | 1256 | 638 | 50.8% |
| 2 | 2623 | 20 | 1497 | 785 | 52.4% |
| 3 | 4147 | 20 | 1321 | 601 | 45.5% |
| 4 | 5505 | 20 | 1559 | 719 | 46.1% |
| 5 | 7078 | 5 | 1200 | 582 | 48.5% |
| 6 | 8317 | 5 | 1370 | 689 | 50.3% |
| 7 | 9720 | 20 | 1230 | 619 | 50.3% |

### fvg-return

| Fold | Train count | Best expiry | Test decided | Test wins | Fold accuracy |
|---|---|---|---|---|---|
| 1 | 5597 | 2 | 5109 | 2481 | 48.6% |
| 2 | 10920 | 2 | 5745 | 2833 | 49.3% |
| 3 | 16960 | 1 | 4982 | 2395 | 48.1% |
| 4 | 22448 | 1 | 5330 | 2605 | 48.9% |
| 5 | 28281 | 1 | 5053 | 2484 | 49.2% |
| 6 | 33821 | 1 | 5109 | 2468 | 48.3% |
| 7 | 39384 | 1 | 5411 | 2598 | 48.0% |

### order-block-continuation

| Fold | Train count | Best expiry | Test decided | Test wins | Fold accuracy |
|---|---|---|---|---|---|
| 1 | 1104 | 30 | 902 | 444 | 49.2% |
| 2 | 2013 | 30 | 1114 | 547 | 49.1% |
| 3 | 3141 | 30 | 954 | 481 | 50.4% |
| 4 | 4103 | 30 | 964 | 458 | 47.5% |
| 5 | 5082 | 30 | 915 | 434 | 47.4% |
| 6 | 6004 | 30 | 963 | 478 | 49.6% |
| 7 | 6973 | 30 | 1005 | 490 | 48.8% |

### inside-bar

| Fold | Train count | Best expiry | Test decided | Test wins | Fold accuracy |
|---|---|---|---|---|---|
| 1 | 7480 | 1 | 7074 | 3425 | 48.4% |
| 2 | 15095 | 5 | 8373 | 4085 | 48.8% |
| 3 | 23751 | 5 | 7671 | 3596 | 46.9% |
| 4 | 31720 | 5 | 8392 | 4142 | 49.4% |
| 5 | 40410 | 5 | 8170 | 4018 | 49.2% |
| 6 | 48851 | 5 | 8115 | 4058 | 50.0% |
| 7 | 57256 | 5 | 8278 | 3922 | 47.4% |

### fvg-breaker-block

| Fold | Train count | Best expiry | Test decided | Test wins | Fold accuracy |
|---|---|---|---|---|---|
| 1 | 282 | 5 | 203 | 88 | 43.3% |
| 2 | 490 | 5 | 256 | 115 | 44.9% |
| 3 | 760 | 10 | 244 | 136 | 55.7% |
| 4 | 1008 | 5 | 276 | 130 | 47.1% |
| 5 | 1291 | 10 | 250 | 119 | 47.6% |
| 6 | 1548 | 10 | 264 | 125 | 47.3% |
| 7 | 1816 | 5 | 242 | 113 | 46.7% |

### marubozu-bullish

| Fold | Train count | Best expiry | Test decided | Test wins | Fold accuracy |
|---|---|---|---|---|---|
| 1 | 54 | 1 | 68 | 29 | 42.6% |
| 2 | 125 | 2 | 67 | 27 | 40.3% |
| 3 | 197 | 2 | 35 | 18 | 51.4% |
| 4 | 233 | 2 | 58 | 30 | 51.7% |
| 5 | 295 | 2 | 48 | 22 | 45.8% |
| 6 | 346 | 2 | 80 | 40 | 50.0% |
| 7 | 429 | 2 | 63 | 36 | 57.1% |

### harmonic-pattern

| Fold | Train count | Best expiry | Test decided | Test wins | Fold accuracy |
|---|---|---|---|---|---|
| 1 | 994 | 30 | 1185 | 624 | 52.7% |
| 2 | 2185 | 30 | 1133 | 543 | 47.9% |
| 3 | 3324 | 30 | 925 | 509 | 55.0% |
| 4 | 4265 | 30 | 861 | 481 | 55.9% |
| 5 | 5142 | 30 | 925 | 517 | 55.9% |
| 6 | 6078 | 30 | 825 | 412 | 49.9% |
| 7 | 6914 | 30 | 912 | 423 | 46.4% |

### pin-bar

| Fold | Train count | Best expiry | Test decided | Test wins | Fold accuracy |
|---|---|---|---|---|---|
| 1 | 56 | 5 | 49 | 19 | 38.8% |
| 2 | 106 | 3 | 49 | 24 | 49.0% |
| 3 | 158 | 3 | 54 | 28 | 51.9% |
| 4 | 212 | 3 | 58 | 28 | 48.3% |
| 5 | 272 | 3 | 51 | 20 | 39.2% |
| 6 | 324 | 3 | 61 | 32 | 52.5% |
| 7 | 387 | 3 | 56 | 28 | 50.0% |

### marubozu-bearish

| Fold | Train count | Best expiry | Test decided | Test wins | Fold accuracy |
|---|---|---|---|---|---|
| 1 | 49 | 1 | 46 | 20 | 43.5% |
| 2 | 100 | 1 | 51 | 26 | 51.0% |
| 3 | 154 | 1 | 58 | 24 | 41.4% |
| 4 | 216 | 1 | 62 | 28 | 45.2% |
| 5 | 283 | 1 | 53 | 29 | 54.7% |
| 6 | 340 | 1 | 57 | 19 | 33.3% |
| 7 | 401 | 2 | 59 | 28 | 47.5% |

### impulse-breakout

| Fold | Train count | Best expiry | Test decided | Test wins | Fold accuracy |
|---|---|---|---|---|---|
| 1 | 2129 | 2 | 2020 | 935 | 46.3% |
| 2 | 4209 | 2 | 2233 | 1010 | 45.2% |
| 3 | 6509 | 3 | 2016 | 826 | 41.0% |
| 4 | 8587 | 2 | 2407 | 1086 | 45.1% |
| 5 | 11087 | 3 | 2153 | 998 | 46.4% |
| 6 | 13304 | 3 | 2204 | 1036 | 47.0% |
| 7 | 15579 | 3 | 2042 | 939 | 46.0% |

### bearish-engulfing

| Fold | Train count | Best expiry | Test decided | Test wins | Fold accuracy |
|---|---|---|---|---|---|
| 1 | 8 | пропущен (мало train) | 0 | 0 | — |
| 2 | 16 | пропущен (мало train) | 0 | 0 | — |
| 3 | 22 | пропущен (мало train) | 0 | 0 | — |
| 4 | 31 | 5 | 7 | 3 | 42.9% |
| 5 | 38 | 5 | 9 | 4 | 44.4% |
| 6 | 47 | 5 | 9 | 3 | 33.3% |
| 7 | 56 | 5 | 8 | 5 | 62.5% |

### consolidation-breakout

| Fold | Train count | Best expiry | Test decided | Test wins | Fold accuracy |
|---|---|---|---|---|---|
| 1 | 204 | 1 | 257 | 113 | 44.0% |
| 2 | 484 | 2 | 336 | 147 | 43.8% |
| 3 | 835 | 2 | 320 | 138 | 43.1% |
| 4 | 1180 | 2 | 377 | 178 | 47.2% |
| 5 | 1584 | 2 | 294 | 138 | 46.9% |
| 6 | 1904 | 2 | 277 | 121 | 43.7% |
| 7 | 2192 | 2 | 281 | 129 | 45.9% |

### bullish-engulfing

| Fold | Train count | Best expiry | Test decided | Test wins | Fold accuracy |
|---|---|---|---|---|---|
| 1 | 6 | пропущен (мало train) | 0 | 0 | — |
| 2 | 12 | пропущен (мало train) | 0 | 0 | — |
| 3 | 17 | пропущен (мало train) | 0 | 0 | — |
| 4 | 23 | пропущен (мало train) | 0 | 0 | — |
| 5 | 32 | 1 | 5 | 3 | 60.0% |
| 6 | 38 | 1 | 9 | 3 | 33.3% |
| 7 | 47 | 1 | 6 | 3 | 50.0% |

### liquidity-sweep-reaction (reversal-at-key-level)

| Fold | Train count | Best expiry | Test decided | Test wins | Fold accuracy |
|---|---|---|---|---|---|
| 1 | 2 | пропущен (мало train) | 0 | 0 | — |
| 2 | 10 | пропущен (мало train) | 0 | 0 | — |
| 3 | 17 | пропущен (мало train) | 0 | 0 | — |
| 4 | 21 | пропущен (мало train) | 0 | 0 | — |
| 5 | 28 | пропущен (мало train) | 0 | 0 | — |
| 6 | 34 | 3 | 5 | 2 | 40.0% |
| 7 | 39 | 3 | 7 | 3 | 42.9% |
