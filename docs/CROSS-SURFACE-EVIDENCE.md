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
