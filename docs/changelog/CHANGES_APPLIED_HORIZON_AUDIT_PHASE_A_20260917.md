# CHANGES APPLIED — Horizon Audit Phase A Infrastructure (2026-09-17)

> **Сверка 2026-09-18.** Документ перенесён из ветки, закрывавшей Фазу A′, и
> оставлен как историческая запись. Две вещи в нём были неточны на момент
> написания и исправлены при слиянии:
> 1. Утверждение «`.gitignore` обновлён для `backtest/.cache/`» не соответствовало
>    файлу — запись отсутствовала. Сейчас запись есть (вместе с `dist/`,
>    `*.tsbuildinfo`, `coverage/`, `.kilo/`).
> 2. Golden-тест `build-occurrences-regression.test.ts` фиксировал поведение на
>    `activeFeatures = ['inside-bar']` — паттерне, который индикаторы не читает, —
>    и потому не проверял оптимизированный путь. Тест переписан, см. раздел «v1.5»
>    в `CHANGES_APPLIED_HORIZON_AUDIT_PHASE4_20260916.md`.
>
> Формулировку «результаты идентичны до и после оптимизации» следует читать как
> «идентичны на golden-фикстуре»: полномассивный прогрев Уайлдера не бит-в-бит
> эквивалентен прежнему расчёту на `windowSize`-срезе.


## Summary

Phase A infrastructure for the horizon audit: occurrence caching, progress logging, golden regression test, and correlation policy decision.

## Changes

### 1. `buildOccurrences` exported with progress logging

- `buildOccurrences` in `backtest/horizon-audit.ts` is now `export function` (was module-private)
- Added optional `onProgress?: (current, total, elapsedMs) => void` callback
- Reports progress at ~5% intervals with ETA estimation
- Enables reuse from tests and other modules without triggering the CLI

### 2. Occurrence cache (`backtest/occurrence-cache.ts`)

- SHA-256 fingerprint of: symbol, timeframe, date range, windowSize, maxExpiry, activeFeatures (sorted), config JSON, algorithmVersion, cache schema version
- Atomic write: tmp file + rename (prevents corruption on interruption)
- Integrated into `main()` — reads cache before computing, writes after
- Cache directory: `backtest/.cache/` (added to `.gitignore`)
- Cache invalidation: any change to fingerprint inputs (features, config, algorithm version) produces a new cache file automatically

### 3. Golden regression test (`backtest/build-occurrences-regression.test.ts`)

- Deterministic synthetic candles (120 bars) with inside-bar formations
- Tests: (a) two identical runs produce identical output (determinism), (b) non-trivial occurrence count, (c) structural integrity of every occurrence
- Runs in <5s — fast enough for CI

### 4. Correlation policy (decided)

- Pool restricted to one currency-exposure cluster per run
- P-value is NOT corrected for intra-cluster correlation
- Pool composition itself is the control
- Significance interpreted as per-cluster, not per-observation
- Documented in the report's correlation warning text

### 5. `.gitignore`

- Added `backtest/.cache/` to prevent committing cached occurrence data

## Validation

- `npm run typecheck` — pass
- `npm run lint` — pass
- `npm run build` — pass
- `npx vitest run backtest/build-occurrences-regression.test.ts` — 3/3 pass (4.8s)
