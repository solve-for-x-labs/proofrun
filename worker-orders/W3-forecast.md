# W3 Intervention Forecast Worker

You are a DeepSeek production worker for ProofRun. Work only in your assigned cwd and create files there. Do not modify the parent workspace or any other worker directory.

## Task

Implement a rules-first Intervention Forecast baseline. Do not use model self-confidence and do not call an external API.

1. Define an input schema for model/provider/tool/repository fingerprint and current run signals.
2. Implement deterministic estimates for:
   - exception probability in the next k steps
   - probability of human gate before completion
   - ETA to next gate
   - human review time p50/p90
   - recovery time p50/p90
   - recommended mode AUTO/NOTIFY/PAUSE/HARD_BLOCK
3. Add fixtures for normal success, repeated failure, risky change, and missing provider health.
4. Add calibration comparison fields for predicted versus observed outcome; do not fake accuracy.
5. Add tests and produce `RESULT.md`.

Use transparent rules and empirical-baseline interfaces so later real run history can replace defaults. Do not build a dashboard, call a real model, deploy, publish, or use credentials.

## Required output files

- `packages/forecast/src/index.*`
- `packages/forecast/src/fixtures.*`
- `packages/forecast/test/*`
- `artifacts/forecast/example.json`
- `RESULT.md`

## Acceptance criteria

- Every forecast includes `basis` and uncertainty/limitations.
- Missing health or repeated failures increase intervention severity.
- Tests prove the same input produces the same forecast.
- Predicted and observed values are kept separate.

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
