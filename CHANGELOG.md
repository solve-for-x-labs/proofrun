# Changelog

## 0.6.0

- Added `proofrun diff`: aligns the same journey recorded at two commits by step id and reports a
  run verdict (`REGRESSION`, `FIX`, `STILL_FAILING`, `STABLE`, `ADDED`, `REMOVED`) and an
  independent visual verdict (`VISUAL_CHANGED`, `VISUAL_IDENTICAL`, `DOM_CHANGED`,
  `DOM_IDENTICAL`, `NO_HASH_BASELINE`) for every step.
- `diff` resolves the commits between the two recorded heads and lists a changed file as a suspect
  for a step only when that step's `sourceRefs` reference it. An unresolvable range is reported as
  `UNAVAILABLE` or `SAME_COMMIT` rather than guessed.
- Added a side-by-side `diff.html` reviewer surface that shows the real before and after captures,
  the exact failed assertion, and the code evidence in one screen.
- Added `proofrun gate`: a merge decision over a recorded bundle with `run-status`, `freshness`,
  `git-binding`, `clean-tree`, `runtime-media`, `network-failures`, and optional `console-events`
  checks, written to `gate.json`.
- `git-binding` now requires a commit that actually resolves in the target repository, so a
  placeholder or foreign sha blocks instead of passing.
- `--no-fresh` is recorded as a `WARN`, never as a `PASS`.
- Exit codes are now stable across commands: `0` pass, `1` error, `2` stale evidence, `3` gate
  blocked or regression found.
- Added a pull-request CI workflow example at `examples/ci/evidence-gate.yml` and
  `docs/REGRESSION-GATE.md`.

## 0.5.0

- Added `proofrun merge`: combines web and mobile runtime manifests into one cross-surface admin
  viewer and `evidence-bundle.json`.
- Added an adapter-neutral mobile evidence schema so Maestro, ARTEMIS, Appium, and native test
  runners can emit the same manifest without ProofRun reimplementing device control.
- Steps without captured media render as `NO_RUNTIME_MEDIA` instead of being presented as a pass.
- Journey capture now uses the viewport by default; `fullPage` must be requested in the spec.

## 0.4.2

- The CLI reads its version from the installed package metadata, so the release version and the
  reported version cannot drift.

## 0.4.0

- Added real Playwright-backed user journey capture and visual replay.
- Recorded per-step screenshots, assertions, console/network failures, DOM/screenshot hashes, and
  Git freshness.
- Added `proofrun journey` and `proofrun verify` with explicit `STALE_REVERIFY_REQUIRED` handling.
- Added a runnable journey fixture and schema examples.

## 0.3.0

- Added broad source-extension discovery for common JS/TS, Python, Go, Rust, JVM, Swift, Vue,
  Svelte, PHP, and Ruby repositories.
- Added `--format`, `--include`, `--exclude`, `--help`, and `--version` CLI options.
- Added stable `schemaVersion` and relative provenance paths.
- Added OSS repository metadata, contributing guidance, and security policy.

## 0.2.0

- First installable GitHub Release CLI.
