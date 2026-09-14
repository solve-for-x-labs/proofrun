# ProofRun local implementation result

## STATUS
PARTIAL

## Delivered

- Independent Git repository with Wave 0 contracts and task schema.
- DeepSeek harness execution plan and retained worker evidence.
- Source-linked visual baseline (`graph.json` + standalone HTML).
- Rules-first intervention forecast with mode recommendation and uncertainty limits.
- Automated local tests and baseline artifact generation.
- Visual Truth Layer: `docs/VISUAL-TRUTH-LAYER.md` contract, `viewer/` read-only surface with
  deep-linkable tabs, `schemas/evidence-bundle.example.json`, and a redesigned baseline report.
- Read-only internal system analysis at `analysis/2026-09-14-internal-system-evidence/`.
- General-purpose CLI options, stable graph schema, adapter boundary, and OSS contribution/security docs.

## Evidence

- `npm test`: 7 passed, 0 failed.
- `npm run build:baseline`: completed; artifacts exist and are non-empty.
- W1 worker: 33/33 tests passed; W3 worker: 22/22 tests passed.
- W2 first worker: timed out after 900s; the reduced retry also timed out after 600s with zero stdout.
- v0.3.0 release installation from a fresh temp environment succeeded; schema v0.3 and JSON/HTML artifacts verified.
- Viewer served over `npm run view`: `/viewer/`, all three app captures, the app manifest, and
  `artifacts/baseline/graph.json` each returned HTTP 200; headless screenshots of `#live`,
  `#apps`, and `#evidence` render the live site iframe, the device captures, and the source graph.
- Every referenced public URL responded (`www.solve-for-x.net` 200, `ops.solve-for-x.net` 307,
  six case assets 200).

## Not claimed

- No real production repository adapter, live UI server, merge/deploy action, or calibrated
  probability model yet.
- The app captures are `PARTIAL_RUNTIME_EVIDENCE`: real device screenshots from internal QA,
  not a simulator session re-run during this execution. No cryptographic binding between a
  capture and a commit exists yet.
- No adversarial reviewer separate from the authoring model, and no automatic stale-evidence
  detection.
- No claim that GPU capacity is infinite; the harness remains concurrency-capped.

## Release status

The public GitHub Release `v0.3.0` is now available with an installable tarball. Fresh
installation from the release URL, CLI execution, filters, and schema output were verified.
npm registry publication was intentionally not performed; the release asset is the current
supported distribution.
