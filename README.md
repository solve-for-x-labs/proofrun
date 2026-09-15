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

ProofRun does not drive devices and does not try to. Tools like ARTEMIS and Maestro are strong
execution layers — real device control, accessibility-aware interaction, smart waits, traces — and
ProofRun consumes their output through a neutral manifest instead of reimplementing it.

| | Execution layer | ProofRun |
|---|---|---|
| Drives devices and browsers | yes | no, by design |
| Reports whether this run passed | yes | yes |
| Binds each step to commit, diff, and source line | no | yes |
| Marks a run stale when the code moves under it | no | yes |
| Same-journey before/after verdict per step | no | yes |
| Web, iOS, and Android in one reviewer surface | per tool | yes |
| Refuses to show a synthetic or stale screen as proof | n/a | `NO_RUNTIME_MEDIA` |
| Emits a merge decision with exit codes | no | `ALLOW` / `BLOCK` |

The claim is narrow: execution tools answer *did it run*, ProofRun answers *can a human merge it*.
See [docs/CROSS-SURFACE-EVIDENCE.md](docs/CROSS-SURFACE-EVIDENCE.md) for the adapter contract.

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
| `verify` | freshness of a recorded bundle | 0 / 2 |
| `merge` | one admin viewer across web and mobile surfaces | 0 / 1 |
| `diff` | before/after verdict per step with commit range | 0 / 3 |
| `gate` | `ALLOW` / `BLOCK` merge decision | 0 / 3 |

## Design rules

- No diagram without provenance.
- Humans decide at irreversible boundaries; routine recovery stays autonomous.
- Model self-confidence is not ground truth.
- Every run records verification and rollback evidence.
