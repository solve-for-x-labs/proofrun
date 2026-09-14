# Changelog

## 0.4.2

- Read the CLI version from the installed package metadata so release and CLI versions cannot drift.

## 0.3.0

- Added broad source-extension discovery for common JS/TS, Python, Go, Rust, JVM, Swift, Vue,
  Svelte, PHP, and Ruby repositories.
- Added `--format`, `--include`, `--exclude`, `--help`, and `--version` CLI options.
- Added stable `schemaVersion` and relative provenance paths.
- Added OSS repository metadata, contributing guidance, and security policy.

## 0.2.0

- First installable GitHub Release CLI.
## 0.4.0

- Add real Playwright-backed user journey capture and visual replay.
- Record per-step screenshots, assertions, console/network failures, DOM/screenshot hashes, and Git freshness.
- Add `proofrun journey` and `proofrun verify` commands with explicit `STALE_REVERIFY_REQUIRED` handling.
- Add a runnable journey fixture and schema examples.
