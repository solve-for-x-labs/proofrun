# Worker Result

## STATUS
PARTIAL

## Scope
First core contract slice for ProofRun, implemented only in the assigned cwd
(`worker-runs/W1-core`). Added typed contracts + deterministic validators for the six
core object types, deterministic fixtures for the three gate scenarios, and a runnable
test suite covering valid input, invalid input, and state-transition rejection.

Deliberately out of scope (per the order): no UI, no real model calls, no deployment,
no publishing, no external credentials, no modification of the parent workspace or other
worker directories.

## Files
- `packages/core/src/contracts.ts` — the six typed contracts (`TaskSpec`, `RunFingerprint`,
  `RunEvent`, `Forecast`, `GateDecision`, `EvidenceManifest`), their explicit string-literal
  unions (each exported as a `const` array + type alias), the `source` discriminator on every
  object, runtime validators (`validate*` + `validateContract`), and the deterministic
  state machines (`transitionRunState`, `transitionGateState`, `circuitBreakerState`,
  `breakerTripped`, `InvalidTransitionError`).
- `packages/core/src/fixtures.ts` — deterministic (fixed-string, no clock/randomness)
  fixtures: task spec, run fingerprint, and three scenarios:
  1. intent approval (clean run, intent gate approved, `AUTO`),
  2. repeated-failure circuit breaker (3 consecutive `step_failure` → breaker opens, `HARD_BLOCK`),
  3. blast-radius approval (wide change, blast-radius gate approved, `PAUSE`).
- `packages/core/src/index.ts` — public barrel re-exporting contracts + fixtures.
- `packages/core/test/contracts.test.mjs` — 33 tests (valid / invalid / state-transition
  rejection) using Node's built-in test runner; zero dependencies.
- `packages/core/package.json` — mirrors the skeleton (`type: module`, `test` / `typecheck`
  scripts) so the test runner resolves ESM correctly.

## Commands Run
- `node --test packages/core/test/contracts.test.mjs`  → **33/33 pass, exit code 0**
  (run from the worker cwd; import of `*.ts` sources uses Node v26 native type-stripping.)
- `node --version` → `v26.8.1`
- `npx --yes typescript@5.7.2 --version` → **failed** (npm cannot write its cache — see below)
- Directory inspection of `packages/core`, `schemas/task-spec.example.json`, and
  `docs/WAVE-0.md` (read-only, parent workspace).

## Evidence
- Test summary from the final run: `tests 33 / pass 33 / fail 0 / cancelled 0`, `EXIT=0`.
- Every contract object carries a `source` field naming its type, and every discriminated
  field is an explicit union backed by an exported `const` array
  (`CONTRACT_SOURCE_NAMES`, `GATE_KINDS`, `DECISIONS`, `AUTONOMY_MODES`, `PROBABILITY_BASES`,
  `RUN_EVENT_KINDS`, `RUN_STATES`, `GATE_STATES`).
- `Forecast` requires `basis` (probability basis) and `recommendedMode` (recommended autonomy
  mode); tests assert both are present and in-union.
- `GateDecision` requires non-empty `evidenceRefs` and an ISO `decidedAt`; tests assert both.
- Circuit breaker: `circuitBreakerState(3, 3) === "trip_open"` and `breakerTripped` fires on
  the 3-failure fixture and does not fire on the clean run (Wave-0 AC #3).
- State machines throw `InvalidTransitionError` on illegal moves (e.g. `completed → running`,
  `planned → completed`, `idle → decided`) and accept the happy path.

## Known Limitations
- **`tsc` typecheck cannot be run: the TypeScript dependency is unavailable.** The parent
  skeleton declares a `typecheck: tsc --noEmit` script, but `tsc` is not installed
  (no `node_modules` in the tree), and `npx --yes typescript` fails because the npm cache
  directory `/Users/apple/.npm` is not writable under the workspace-write sandbox:
  `npm error ... run: sudo chown -R 501:20 "/Users/apple/.npm"`. I am reporting this exactly
  rather than claiming the static typecheck passed. The runtime behavior is fully verified by
  the Node-native test suite, but the *static* type compilation is not proven here.
  Full PASS for this criterion = install TypeScript (writable npm cache / pre-provisioned
  `node_modules`) and run `node_modules/.bin/tsc --noEmit` in `packages/core`.
- Node's strip-only TS mode does not support `readonly` parameter properties, so
  `InvalidTransitionError` declares its fields explicitly. This is a Node runtime limitation,
  handled in code; it has no bearing on the contract design.
- `package.json` in the worker cwd mirrors the parent skeleton's; the parent workspace was
  left untouched (read-only).
- Forecast `basis`/`recommendedMode` values are asserted to be valid union members, but the
  *calibration* of those probabilities is out of scope for this slice (that is the W3
  forecast worker's concern).

## Next Input
- Provide a writable npm cache (or a pre-installed `typescript`) so `tsc --noEmit` can be run
  to close the one unverified criterion.
- Feed the W2 (visual change surface) and W3 (forecast calibration) slices the `Forecast`
  contract: `exceptionNextKSteps` + `humanGateBeforeFinish` are the fields to calibrate, and
  `recommendedMode` is the field the forecast worker should populate.
- Wire `GateDecision.evidenceRefs` to the W2 change-surface output so every gate decision
  references real surface/rollback artifacts.
- A real `RunFingerprint` (live `commit` + `startedAt`) from an actual agent run to replace the
  deterministic fixture commit/timestamp.
