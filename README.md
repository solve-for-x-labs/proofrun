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
```

## Run a real user journey

The baseline is only a source map. It is not runtime proof. For runtime proof, define a journey
with real actions and assertions, then run it with the optional Playwright browser adapter:

```bash
npm install -D playwright
npx playwright install chromium
node examples/journey-app/server.mjs
# in another terminal
node bin/proofrun.mjs journey schemas/journey-spec.example.json \
  --repo . --out proofrun-journey
open proofrun-journey/replay.html
```

The replay is the primary artifact: it shows the real screen for every step, the exact failed
assertion, console/network failures, runtime fingerprint, and the Git state that produced the
screens. A failed journey stops at the first failed step and still preserves that screen.

Re-check freshness before accepting evidence:

```bash
node bin/proofrun.mjs verify proofrun-journey/evidence.json --repo .
# FRESH or exit 2 with STALE_REVERIFY_REQUIRED
```

The example fixture is deliberately small but real. Replace the example JSON with a journey for
your web app. Supported actions are `goto`, `fill`, `click`, and `press`; assertions are
`visible`, `text`, and `url`. When Playwright is not installed, ProofRun fails explicitly rather
than presenting a synthetic screenshot as runtime evidence.

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

The standalone baseline page is a reviewer surface, not runtime proof. The journey replay is the
runtime viewer. It shows actual browser pixels first; text is only the decision metadata around
the captured screen. No screenshot is presented as live evidence unless it was captured during
the current run.

## Design rules

- No diagram without provenance.
- Humans decide at irreversible boundaries; routine recovery stays autonomous.
- Model self-confidence is not ground truth.
- Every run records verification and rollback evidence.
