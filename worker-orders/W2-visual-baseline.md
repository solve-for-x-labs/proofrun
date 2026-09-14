# W2 Visual Baseline Worker

You are a DeepSeek production worker for ProofRun. Work only in your assigned cwd and create files there. Do not modify the parent workspace or any other worker directory.

## Task

Build a minimal source-linked visual baseline analyzer for a small TypeScript/Next.js-like fixture.

1. Create a deterministic fixture under `fixtures/nextjs-coding-task/` with routes, components, one state enum/reducer, and tests.
2. Analyze the fixture using a dependency-light approach (standard library or already available tools first).
3. Produce graph JSON containing nodes and edges with source file and line provenance.
4. Produce a minimal local HTML visualization or static SVG that lets a reviewer identify the source path for each displayed node.
5. Add one test or validation command proving every displayed node has provenance.
6. Produce `RESULT.md` using the required result format below.

Do not call a real model, deploy, publish, or use external credentials. Do not claim AST precision if the implementation is regex or heuristic; label the analyzer basis honestly.

## Required output files

- `fixtures/nextjs-coding-task/`
- `packages/analyzers/src/visual-baseline.*`
- `artifacts/baseline/graph.json`
- `artifacts/baseline/index.html` or `index.svg`
- `RESULT.md`

## Acceptance criteria

- At least one route, component, state node, and test node are represented.
- Every node has a relative source path and line or range when available.
- The output can be opened without a server, or the exact server command is documented.
- Limitations are explicit.

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
