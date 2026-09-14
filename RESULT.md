# ProofRun local implementation result

## STATUS
PARTIAL

## Delivered

- Independent Git repository with Wave 0 contracts and task schema.
- DeepSeek harness execution plan and retained worker evidence.
- Source-linked visual baseline (`graph.json` + standalone HTML).
- Rules-first intervention forecast with mode recommendation and uncertainty limits.
- Automated local tests and baseline artifact generation.
- General-purpose CLI options, stable graph schema, adapter boundary, and OSS contribution/security docs.

## Evidence

- `npm test`: 7 passed, 0 failed.
- `npm run build:baseline`: completed; artifacts exist and are non-empty.
- W1 worker: 33/33 tests passed; W3 worker: 22/22 tests passed.
- W2 first worker: timed out after 900s; the reduced retry also timed out after 600s with zero stdout.
- v0.3.0 release installation from a fresh temp environment succeeded; schema v0.3 and JSON/HTML artifacts verified.

## Not claimed

- Public GitHub repository and `v0.3.0` release are available.
- No real production repository adapter, live UI server, merge/deploy action, or calibrated
  probability model yet.
- No claim that GPU capacity is infinite; the harness remains concurrency-capped.

## Release status

The public GitHub Release `v0.3.0` is now available with an installable tarball. Fresh
installation from the release URL, CLI execution, filters, and schema output were verified.
npm registry publication was intentionally not performed; the release asset is the current
supported distribution.
