# Wave 1 implementation evidence

## Integrated local slice

- `@proofrun/core`: typed vocabulary for gates, decisions, fingerprints and forecasts.
- `@proofrun/analyzers`: deterministic source-linked visual baseline with explicit heuristic basis.
- `@proofrun/forecast`: rules-first exception, gate, ETA, review and recovery estimate.
- `artifacts/baseline/index.html`: standalone reviewer surface; no server required.

## Verification

```text
npm test                 4 passed, 0 failed
npm run build:baseline   graph.json and index.html generated
```

The DeepSeek/Qwen worker evidence is retained under `worker-runs/`. W1 reported 33/33
contract tests and W3 reported 22/22 forecast tests. W1 static `tsc` remains unverified
because its worker could not use the npm cache; the integrated slice deliberately uses
Node's native type stripping and dependency-free tests until package installation is made
reproducible.

## Honest boundaries

- The visual graph is a baseline heuristic, not a TypeScript compiler or runtime trace.
- Forecast values are rules-first placeholders until ProofRun records real run history.
- No merge, deployment, publishing, or external model call is performed by this slice.
