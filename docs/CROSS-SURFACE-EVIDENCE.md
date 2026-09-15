# Cross-surface evidence

ProofRun can combine evidence from a web journey and a mobile adapter into one visual administrator surface.

```bash
proofrun merge web/evidence.json mobile/evidence.json --out proofrun-admin
open proofrun-admin/admin.html
```

The mobile input is intentionally adapter-neutral. ARTEMIS, current Maestro MCP, Appium, Flutter integration tests, and native test runners can all emit the same manifest without ProofRun reimplementing device control.

## Why this is different

ARTEMIS and Maestro are strong execution layers: they drive real devices, inspect accessibility/UI state, wait for dynamic screens, and record traces. ProofRun adds the decision layer that execution tools do not own:

- source/commit/diff binding for every surface;
- a single viewer for web, iOS, Android, and other adapters;
- explicit `NO_RUNTIME_MEDIA` instead of synthetic or stale screenshots;
- before/after and failure-step review as first-class evidence;
- human review only after the actual screen, action, failure, and source reference are visible together.

The archived `mobile-dev-inc/maestro-mcp` package must not be used as a dependency. Current Maestro includes MCP in its CLI; ProofRun should integrate through the current CLI/MCP or the neutral manifest.

## The decision layer, concretely

`merge` puts every surface in one viewer. Two further commands turn that viewer into a decision:

- `proofrun diff` compares the same journey recorded at two commits and marks each step
  `REGRESSION`, `FIX`, `STILL_FAILING`, or `STABLE`, with an independent visual verdict and the
  commits that touched the files the step references.
- `proofrun gate` converts a recorded bundle into `ALLOW` or `BLOCK` with an explicit check list
  and CI exit codes.

Neither re-executes anything. They read what an execution layer already recorded, which is why
adapter neutrality matters: any tool that emits the manifest gets regression detection and a merge
gate without changing how it drives devices.

See [REGRESSION-GATE.md](REGRESSION-GATE.md).
