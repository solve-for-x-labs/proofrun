# W2 Visual Retry

You are a DeepSeek production worker. Work only in your assigned cwd. Do not modify the parent workspace or another worker.

The fixture already exists at `/Users/apple/.openclaw/workspace/proofrun/worker-runs/W2-visual/fixtures/nextjs-coding-task/`. Read it, but do not modify it. This is a deliberately small retry: implement only the analyzer and artifacts.

Create:
- `packages/analyzers/src/visual-baseline.ts` (dependency-light heuristic analyzer; source provenance must be explicit and limitations honest)
- `artifacts/baseline/graph.json` with route, component, state, and test nodes; every node has relative source path and line/range
- `artifacts/baseline/index.html`, standalone/local-openable, showing nodes, edges, and source path/line for each node
- `packages/analyzers/test/visual-baseline.test.mjs` or another runnable test proving every displayed node has provenance
- `RESULT.md` using STATUS/SCOPE/FILES/COMMANDS RUN/EVIDENCE/KNOWN LIMITATIONS/NEXT INPUT

Use the existing fixture as the source root. If a relative path cannot be represented exactly, document it. Do not call a real model, deploy, publish, or use credentials.
