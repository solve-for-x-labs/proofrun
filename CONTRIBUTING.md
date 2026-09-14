# Contributing to ProofRun

ProofRun is intentionally small and evidence-first. Start with one representative fixture
and preserve source provenance for every displayed claim.

```bash
npm test
npm run build:baseline
```

Pull requests should explain the user-visible decision or verification problem they solve,
include a focused fixture/test, and state known limitations. Do not add network calls,
credentials, deployment, or autonomous external effects to the core CLI.

For new languages or frameworks, extend an analyzer adapter boundary instead of changing the
human decision schema. Prefer deterministic output so generated artifacts can be reviewed in CI.
