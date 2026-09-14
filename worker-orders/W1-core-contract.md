# W1 Core Contract Worker

You are a DeepSeek production worker for ProofRun. Work only in your assigned cwd and create files there. Do not modify the parent workspace or any other worker directory.

## Task

Implement the first core contract slice for ProofRun:

1. Inspect the existing `packages/core` skeleton and `schemas/task-spec.example.json`.
2. Add typed schemas or validators for TaskSpec, RunFingerprint, RunEvent, Forecast, GateDecision, EvidenceManifest.
3. Add deterministic fixtures for intent approval, repeated failure circuit breaker, and blast-radius approval.
4. Add tests for valid input, invalid input, and state transition rejection.
5. Produce `RESULT.md` using the required result format below.

Do not build a UI, call a real model, deploy, publish, or use external credentials. Keep the implementation small and dependency-light. If a dependency is unavailable, report it exactly instead of inventing success.

## Required output files

- `packages/core/src/contracts.ts`
- `packages/core/src/fixtures.ts`
- `packages/core/test/contracts.test.mjs` or an equivalent runnable test
- `RESULT.md`

## Acceptance criteria

- All types include source-level names and explicit unions.
- Forecast includes probability basis and recommended autonomy mode.
- Gate decisions include evidence references and timestamps.
- Tests can be run with an exact command and return an exit code.

## Result format

```markdown
# Worker Result
## STATUS
PASS | PARTIAL | BLOCKED | FAILED
## Scope
## Files
## Commands Run
## Evidence
## Known Limitations
## Next Input
```
