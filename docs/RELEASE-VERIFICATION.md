# Release verification

Release: [v0.3.0](https://github.com/dlwlgnsrhy/proofrun/releases/tag/v0.3.0)

Asset:

```text
https://github.com/dlwlgnsrhy/proofrun/releases/download/v0.3.0/proofrun-0.3.0.tgz
```

Verified on 2026-09-14:

```bash
npm install --prefix "$TMP" \
  https://github.com/dlwlgnsrhy/proofrun/releases/download/v0.3.0/proofrun-0.3.0.tgz
"$TMP/node_modules/.bin/proofrun" baseline packages --out "$TMP/out" --format both --exclude worker-runs
```

Observed: command completed and generated non-empty `graph.json` and `index.html` in a fresh
temporary installation with schema v0.3, JSON, and HTML output. No npm registry publication was
performed; the GitHub Release asset is the supported installation path for this version.
