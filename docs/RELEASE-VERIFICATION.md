# Release verification

## v0.6.0 — packaged, not yet published

No GitHub Release or npm publication exists for 0.6.0. The tarball below was built and verified
locally; publishing is a separate, explicitly approved step.

Verified on 2026-09-15 from a clean install of `proofrun-0.6.0.tgz` in an empty project:

```bash
npm pack --pack-destination "$TMP/pack"
npm install --prefix "$TMP/install" "$TMP/pack/proofrun-0.6.0.tgz"
BIN="$TMP/install/node_modules/.bin/proofrun"
"$BIN" --version                                  # 0.6.0, read from package metadata
"$BIN" diff before/evidence.json after/evidence.json --repo "$REPO" --out "$TMP/diff"
"$BIN" gate before/evidence.json --repo "$REPO"   # stale evidence
"$BIN" gate fixed/evidence.json --repo "$REPO"    # current evidence
```

Observed:

| Command | Result | Exit |
|---|---|---|
| `--version` | `0.6.0` | 0 |
| `diff` on a real regression | `REGRESSION: 3 steps · 1 regression(s) · 0 fix(es) · 3 visual change(s)` | 3 |
| `gate` on stale evidence | `BLOCK: freshness` | 3 |
| `gate` on current evidence | `ALLOW` | 0 |

The evidence used was recorded by `proofrun journey` against the bundled fixture served from a real
Git working tree, with a commit that changed the asserted success copy in between. `diff.html`
loaded both 1280×800 captures from the installed output with no console errors.

`npm test` — 15 tests, 15 pass.

## v0.3.0

Release: [v0.3.0](https://github.com/solve-for-x-labs/proofrun/releases/tag/v0.3.0)

Asset:

```text
https://github.com/solve-for-x-labs/proofrun/releases/download/v0.3.0/proofrun-0.3.0.tgz
```

Verified on 2026-09-14:

```bash
npm install --prefix "$TMP" \
  https://github.com/solve-for-x-labs/proofrun/releases/download/v0.3.0/proofrun-0.3.0.tgz
"$TMP/node_modules/.bin/proofrun" baseline packages --out "$TMP/out" --format both --exclude worker-runs
```

Observed: command completed and generated non-empty `graph.json` and `index.html` in a fresh
temporary installation with schema v0.3, JSON, and HTML output. No npm registry publication was
performed; the GitHub Release asset is the supported installation path for this version.
