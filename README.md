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

Early public prototype: [github.com/solve-for-x-labs/proofrun](https://github.com/solve-for-x-labs/proofrun).
The core is dependency-light, read-only, and uses explicit heuristic labels.

## Run locally

```bash
npm test
npm run build:baseline
open artifacts/baseline/index.html
# 실제 웹 화면·앱 캡처·공개 리소스를 보는 뷰어
npm run view
open http://localhost:8766/viewer/
```

Each viewer tab is deep-linkable: `#live`, `#apps`, `#resources`, `#evidence`.
The `#evidence` tab reads `artifacts/baseline/graph.json`, so run `npm run build:baseline` first.

The viewer is a read-only visual surface: it loads the live Solve-for-X web page,
public web assets, and provenance-labelled app screenshots. App screenshots are
marked `PARTIAL_RUNTIME_EVIDENCE` unless a simulator/device adapter captured them
during the current run; the viewer never presents an old capture as a live run.

## Install the CLI

After the tagged GitHub release is published:

```bash
npm install -g https://github.com/solve-for-x-labs/proofrun/releases/download/v0.3.0/proofrun-0.3.0.tgz
proofrun baseline ./your-repository --out ./proofrun-output
```

The CLI is dependency-free and requires Node 22 or newer. Use `--format json` in CI, `--format
html` for a reviewer artifact, and `--include`/`--exclude` to scope large repositories.

## What makes it general-purpose

- Works on common JavaScript/TypeScript, Python, Go, Rust, JVM, Swift, Vue, Svelte, PHP, and
  Ruby source trees without assuming one framework.
- Keeps every displayed node linked to a relative source path and line.
- Produces a stable JSON schema that future AST/runtime adapters can implement.
- Does not execute the target project, access credentials, call the network, or modify Git.
- Keeps human approval, forecast, and irreversible-effect policy separate from the analyzer.

See [docs/ADAPTERS.md](docs/ADAPTERS.md) for the extension contract and [CONTRIBUTING.md](CONTRIBUTING.md)
for the OSS workflow.

The standalone page is a reviewer surface, not a production dashboard. It shows the
source path and line for each displayed node so a human can verify the picture against code.

## Design rules

- No diagram without provenance.
- Humans decide at irreversible boundaries; routine recovery stays autonomous.
- Model self-confidence is not ground truth.
- Every run records verification and rollback evidence.
