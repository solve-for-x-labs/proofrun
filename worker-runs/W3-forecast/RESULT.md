# Worker Result

## STATUS
PASS

## Scope
Implemented a rules-first **Intervention Forecast baseline** for ProofRun. It is fully
deterministic: no model self-confidence, no external API, no network, no clock, no
credentials. All forecasts are transparent (every output carries a `basis` string and an
`uncertainty` block) and empirical-first at isolated "resolver" seams so later real run
history can replace the default priors without touching the scoring rules.

Delivered the five required output artifacts plus a deterministic generator and a test
suite. No dashboard, no real model call, no deploy/publish.

## Files
- `packages/forecast/src/index.ts` — input schema (fingerprint + run signals), severity
  model, deterministic estimators (exception prob over k steps, gate prob, ETA to next gate,
  review p50/p90, recovery p50/p90), mode recommender, `percentile`, empirical resolver,
  and calibration (predicted/observed kept separate; accuracy only from matched pairs).
- `packages/forecast/src/fixtures.ts` — five fixtures: `normalSuccess`, `repeatedFailure`,
  `riskyChange`, `providerHealthMissing` (the four required), plus `empiricalHistory`
  (demonstrates real history replacing defaults).
- `packages/forecast/test/forecast.test.ts` — 22 tests (node:test).
- `packages/forecast/src/make-example.ts` — deterministic generator for the artifact.
- `packages/forecast/package.json` — package metadata / scripts.
- `artifacts/forecast/example.json` — generated example: one forecast per fixture + a
  calibration section.

## Commands Run
- `node --test test/` — 22 tests, 22 pass, 0 fail.
- `node src/make-example.ts` — wrote `artifacts/forecast/example.json`.
- `node -e '...'` — spot-verified artifact contents and the final mode distribution.

## Evidence
Determinism is proven directly: tests re-run `forecast()` on identical inputs and assert
byte-identical JSON (`JSON.stringify` equality) across every fixture.

Final mode distribution from `artifacts/forecast/example.json` (severity / exceptionProb(k=5) / gateProb):

| fixture | mode | sev | exc | gate |
|---|---|---|---|---|
| normalSuccess | AUTO | 0 | 0.1413 | 0.1492 |
| repeatedFailure | PAUSE | 55 | 0.2119 | 0.9228 |
| riskyChange | NOTIFY | 23 | 0.1714 | 0.9913 |
| providerHealthMissing | NOTIFY | 25 | 0.1740 | 0.1664 |
| empiricalHistory | PAUSE | 15 | 0.5981 | 0.916 |

- Missing health raises severity: `providerHealthMissing` (25) > `normalSuccess` (0);
  `unknown` is treated as risk and noted in limitations.
- Repeated failures escalate: `repeatedFailure` sev 55, mode PAUSE; `normalSuccess` AUTO.
- **Real history changes the outcome**: `empiricalHistory` has a *healthy* fingerprint but its
  observed exception rate (2/12 ≈ 0.167) lifts `exception.probNextK` to 0.598 and its source
  to `empirical`, pushing the mode to PAUSE — the empirical seam replacing the default.
- Gate probability is an **intervention point**, not a danger: it drives at most NOTIFY, so
  `riskyChange` (gate 0.991 from 2 planned gates) does not block on a gate alone.
- Calibration is honest: with only 2 records, all metrics are `null` (not 0) and
  `sufficientForAccuracy` is false with a note; metrics become numeric only at ≥ 5 matched
  samples.

## Known Limitations
- The `DEFAULT_BASELINE` values (base exception/gate rates, review/recovery times) are
  **plausible placeholders, not measured**; this is stated in every default-sourced output.
- Deterministic point rules, not a statistical model; assumes roughly homogeneous,
  independent steps.
- ETA is null when no gate is planned; with gates it uses a steps-per-gate heuristic
  (p90 = 1.8×p50), not a fitted distribution.
- Mode thresholds and severity weights are hand-set constants; they are transparent but
  not yet tuned against real outcomes (that is the `calibration` seam's job).
- No temporal model (trends/seasonality) and no per-provider/tool empirical prior yet —
  the resolver interface exists but only the exception rate is currently wired to history.

## Next Input
- Real run history (per-step exception flags, review/recovery durations, gate timing)
  per provider/tool/repo to replace `DEFAULT_BASELINE` and calibrate thresholds.
- Fitted review/recovery distributions to replace the 1.8×p90 heuristic.
- A per-provider/per-tool empirical exception-rate prior (same resolver seam as the global one).
