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
The baseline analyzer is dependency-free and reads source without executing the target project.
Runtime journeys use optional Playwright, drive a real browser, and can make network requests and
change application state. Commands write their reports to disk; none performs a Git merge.

## Run locally

From a source checkout (Node 22 or newer):

```bash
node bin/proofrun.mjs --version
npm test
npm run build:baseline
open artifacts/baseline/index.html
```

## Run a real user journey

The baseline is only a source map. It is not runtime proof. For runtime proof, define a journey
with real actions and assertions, then run it with the optional Playwright browser adapter:

```bash
npm install --include=optional
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

## Catch a regression between two commits

A green run tells you this run passed. It does not tell you what stopped working. Record the same
journey on the baseline commit and on the change, then compare them:

```bash
proofrun diff baseline/evidence.json head/evidence.json --repo . --out evidence/diff
open evidence/diff/diff.html
```

Every step is aligned by id and gets two verdicts: the run verdict (`REGRESSION`, `FIX`,
`STILL_FAILING`, `STABLE`, `ADDED`, `REMOVED`) and the visual verdict (`VISUAL_CHANGED`,
`VISUAL_IDENTICAL`, `NO_HASH_BASELINE`). The viewer puts the two real screens side by side, with
the failed assertion, the commits between the two runs, and the changed files that step actually
references. A step that still passes while its screen changed is shown as exactly that.

## Block the merge on the evidence

```bash
proofrun gate evidence/head/evidence.json --repo . --max-network-failures 0
```

```text
  PASS  run-status — status=PASSED
  BLOCK freshness — STALE_REVERIFY_REQUIRED · evidence head=d81f3ac… · current head=75d389c…
  PASS  git-binding — d81f3ac46091bd98f0b1b9e5e6186dd40312f341
  PASS  runtime-media — 3/3 steps have media · video=yes
  PASS  network-failures — 0 network failure(s)
ProofRun gate BLOCK: freshness
```

That is the case the gate exists for: a genuinely passing run whose evidence belongs to an older
commit. Exit codes are `0` allow, `1` error, `2` stale, `3` blocked or regressed, so CI can
branch on them directly. See [docs/REGRESSION-GATE.md](docs/REGRESSION-GATE.md) and the
pull-request workflow in [examples/ci/evidence-gate.yml](examples/ci/evidence-gate.yml).

## Where this sits next to execution tools

ProofRun includes a Playwright/Chromium browser runner. It does not include a native mobile
device driver: mobile results must be converted to its neutral evidence manifest by an adapter.
This is not a claim that ARTEMIS or Maestro lack review, verification, or CI features.

| Tool | Documented scope |
|---|---|
| [Google ARTEMIS](https://github.com/google/artemis#readme) | Natural-language Android automation, accessibility/visual grounding, CLI/MCP/SDK access, execution replay, and configurable verification. Its README lists iOS expansion as roadmap work. |
| [Archived maestro-mcp](https://github.com/mobile-dev-inc/maestro-mcp#readme) | The standalone Python project is no longer maintained; its README points to the implementation in the main Maestro repository. |
| [Current Maestro](https://github.com/mobile-dev-inc/maestro#readme) | Android, iOS, and web UI testing, YAML flows, assertions, automatic waiting, and CI-oriented tests. MCP ships in the CLI as `maestro mcp`, with live device interaction and a viewer. |
| ProofRun (this checkout) | Browser journey capture, Git-state freshness checks, comparison of recorded steps, policy gate exit codes, and a combined viewer for compatible web/mobile manifests. |

These are primary-source descriptions, not an exhaustive feature matrix or a head-to-head test.
No absence of a competitor feature is inferred from documentation silence. A bundled, tested
ARTEMIS/Maestro exporter is not claimed. ProofRun source references come from the supplied journey
or adapter; automatic source-line attribution for every runtime step is not established.
`verify` checks recorded Git state, not product correctness or the authenticity of imported media.
`gate` provides a policy result for CI and human review; it does not itself approve or merge code.
See [docs/CROSS-SURFACE-EVIDENCE.md](docs/CROSS-SURFACE-EVIDENCE.md) for the adapter contract.

## Install the CLI

The source checkout's `package.json` and CLI report **0.6.0**. That local version does not establish
that a matching GitHub Release asset or npm registry package has been published. Do not substitute
`0.6.0` into an older release download URL.

To inspect and install a locally built package, from the checkout:

```bash
npm pack --dry-run
# Review the included files before creating or sharing a package.
npm pack
npm install -g ./proofrun-0.6.0.tgz
proofrun --version
proofrun --help
proofrun baseline ./your-repository --out ./proofrun-output
```

The `proofrun ...` examples require an installed CLI matching this checkout. Without installation,
replace `proofrun` with `node bin/proofrun.mjs` from the checkout. An older installed version may
not support the commands below; check `--version` and `--help`. Fixture/schema paths in examples
are relative to the checkout, not files created in your current directory by global installation.

Node 22 or newer is required. `baseline` needs no third-party runtime dependency; `journey` needs
Playwright (declared as an optional dependency) and its matching Chromium installation. The local
journey setup above installs both. Installing Playwright in an unrelated app directory does not
necessarily make it available to a globally installed ProofRun.
For `baseline`, use `--format json` in CI, `--format html` for a reviewer artifact, and
`--include`/`--exclude` to scope large repositories.

## What makes it general-purpose

- Works on common JavaScript/TypeScript, Python, Go, Rust, JVM, Swift, Vue, Svelte, PHP, and
  Ruby source trees without assuming one framework.
- Keeps every displayed node linked to a relative source path and line.
- Produces a stable JSON schema that future AST/runtime adapters can implement.
- The baseline analyzer does not execute the target project or call the network. The optional
  journey runner executes browser actions against the configured app; use an appropriate test environment.
- Keeps human approval, forecast, and irreversible-effect policy separate from the analyzer.

See [docs/ADAPTERS.md](docs/ADAPTERS.md) for the extension contract and [CONTRIBUTING.md](CONTRIBUTING.md)
for the OSS workflow.

The standalone baseline page is a reviewer surface, not runtime proof. The journey replay is the
runtime viewer. It shows actual browser pixels first; text is only the decision metadata around
the captured screen. No screenshot is presented as live evidence unless it was captured during
the current run.

## 관리자용 실제 이미지·영상 보고서

```bash
proofrun journey schemas/journey-spec.example.json --repo . --out evidence/contact-form
proofrun verify evidence/contact-form/evidence.json --repo .
open evidence/contact-form/admin.html
```

`admin.html`은 실제 단계별 PNG와 실행 WebM을 중심으로 표시하고, 실패 단계·콘솔·네트워크·Git
fingerprint를 보조 판정면으로 제공합니다. `FRESH`가 아닌 증거는 승인 자료로 취급하지 않습니다.
앱은 Android/iOS 어댑터가 생성한 동일한 Evidence Bundle을 연결해야 하며 공개 패키지는 내부 앱
캡처를 포함하지 않습니다.

## Commands

| Command | Output | Exit |
|---|---|---|
| `baseline` | source-linked map of a repository | 0 / 1 |
| `journey` | real browser run: screens, video, assertions, Git fingerprint | 0 / 1 |
| `verify` | freshness of a recorded bundle | 0 / 1 / 2 |
| `merge` | one admin viewer across web and mobile surfaces | 0 / 1 |
| `diff` | before/after verdict per step with commit range | 0 / 1 / 3 |
| `gate` | `ALLOW` / `BLOCK` policy decision (no merge performed) | 0 / 1 / 3 |

Exit `1` means an execution/input error. `verify` returns `2` for stale evidence; `gate` returns
`3` when its policy blocks, including a freshness failure.

## Design rules

- No diagram without provenance.
- Humans decide at irreversible boundaries; routine recovery stays autonomous.
- Model self-confidence is not ground truth.
- Every run records verification and rollback evidence.
