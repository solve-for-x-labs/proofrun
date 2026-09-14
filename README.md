# ProofRun

> Code-grounded human decisions for agentic software work.

ProofRun records what an agent changed, why a human was called, what the real code and runtime prove, and how to verify or roll back the result.

## First vertical slice

```text
real Next.js repository
  -> source-linked baseline map
  -> model/tool/repository fingerprint
  -> agent run
  -> exception forecast and circuit breaker
  -> visual change surface
  -> human decision
  -> verification and reversible evidence package
```

## Status

Early public prototype: [github.com/dlwlgnsrhy/proofrun](https://github.com/dlwlgnsrhy/proofrun).
The first slice is intentionally dependency-light and uses explicit heuristic labels.

## Run locally

```bash
npm test
npm run build:baseline
open artifacts/baseline/index.html
```

The standalone page is a reviewer surface, not a production dashboard. It shows the
source path and line for each displayed node so a human can verify the picture against code.

## Design rules

- No diagram without provenance.
- Humans decide at irreversible boundaries; routine recovery stays autonomous.
- Model self-confidence is not ground truth.
- Every run records verification and rollback evidence.
