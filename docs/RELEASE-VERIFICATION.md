# Release verification

Release: [v0.2.0](https://github.com/dlwlgnsrhy/proofrun/releases/tag/v0.2.0)

Asset:

```text
https://github.com/dlwlgnsrhy/proofrun/releases/download/v0.2.0/proofrun-0.2.0.tgz
```

Verified on 2026-09-14:

```bash
npm install --prefix "$TMP" \
  https://github.com/dlwlgnsrhy/proofrun/releases/download/v0.2.0/proofrun-0.2.0.tgz
"$TMP/node_modules/.bin/proofrun" baseline packages/core --out "$TMP/out"
```

Observed: command completed and generated non-empty `graph.json` and `index.html` in a fresh
temporary installation. No npm registry publication was performed; the GitHub Release asset is
the supported installation path for this version.
