# Regression diff and merge gate

A passing run is not a merge decision. Two questions remain after any execution tool reports success:

1. Did anything that used to work stop working, and which commit touched it?
2. Is this evidence still true for the code we are about to merge?

`proofrun diff` answers the first. `proofrun gate` answers the second.

## `proofrun diff` — the same journey at two commits

```bash
proofrun diff baseline/evidence.json head/evidence.json --repo . --out evidence/diff
open evidence/diff/diff.html
```

Steps are aligned by their declared `id`, so the comparison survives reordering and insertion.
Every aligned step gets two independent verdicts.

| Run verdict | Meaning |
|---|---|
| `REGRESSION` | Passed before, fails now. This is what blocks a merge. |
| `FIX` | Failed before, passes now. |
| `STILL_FAILING` | Failed on both sides; the change did not address it. |
| `STABLE` | Passed on both sides. |
| `ADDED` / `REMOVED` | The step exists on only one side. |

| Visual verdict | Meaning |
|---|---|
| `VISUAL_CHANGED` | Recorded screenshot bytes differ. A `STABLE` step with `VISUAL_CHANGED` is the case assertion-only tooling misses. |
| `VISUAL_IDENTICAL` | Screenshot hashes match. |
| `DOM_CHANGED` / `DOM_IDENTICAL` | Fallback when only DOM hashes were recorded. |
| `NO_HASH_BASELINE` | One side recorded no hash. The screens were **not** compared. |
| `NOT_COMPARABLE` | The step is missing on one side. |

### Commit range and suspect files

When `--repo` resolves both recorded heads, the report carries the commits between them and the
files they changed. A changed file is listed as a **suspect** for a step only when that step's
`sourceRefs` actually reference it:

```json
{
  "id": "submit",
  "verdict": "REGRESSION",
  "visual": "VISUAL_CHANGED",
  "sourceRefs": ["examples/journey-app/server.mjs:3"],
  "suspectCommitFiles": ["examples/journey-app/server.mjs"]
}
```

An empty `suspectCommitFiles` is not a claim that no commit affected the step. It means no
*declared* source reference was touched. Steps with no `sourceRefs` can never produce suspects —
declaring them is what makes this column useful.

`commitRange.status` is explicit about what could not be determined:

- `RESOLVED` — commits and changed files were read from the repository.
- `SAME_COMMIT` — both runs are bound to the same commit, so no range exists.
- `UNAVAILABLE` — one side has no bound head, or the range does not resolve here. Nothing is guessed.

Exit code is `3` when any step regressed, `0` otherwise.

## `proofrun gate` — the merge decision

```bash
proofrun gate evidence/head/evidence.json --repo . --max-network-failures 0
```

Each check prints `PASS`, `WARN`, or `BLOCK`, and the full result is written to `gate.json`
next to the evidence.

| Check | Blocks when |
|---|---|
| `run-status` | The recorded run did not pass its own assertions. |
| `freshness` | The evidence no longer matches the current Git state. **This is the check that stops a stale green run from being merged.** |
| `git-binding` | The recorded head is not a commit that resolves in this repository. A placeholder sha blocks. |
| `clean-tree` | *(warning only)* The working tree was dirty at capture time, so the run is not reproducible from the commit alone. |
| `runtime-media` | A step carries no captured screenshot or video. |
| `network-failures` | Failures exceed `--max-network-failures` (default `0`). |
| `console-events` | Only checked when `--max-console-events` is supplied. |

Policy flags:

```text
--no-fresh                 Skip freshness re-verification; recorded as a WARN, never a PASS
--allow-missing-media      Do not block on steps without captured media
--max-network-failures <n> Default 0
--max-console-events <n>   Unchecked unless supplied
```

Exit codes: `0` allow, `1` error, `2` stale evidence (`verify`), `3` gate blocked or regression found.

`ALLOW` means the declared policy held for this bundle. It is not a correctness claim about the
product, and the gate never re-executes the journey — it reads what was recorded.

## In CI

See [`examples/ci/evidence-gate.yml`](../examples/ci/evidence-gate.yml) for a pull-request workflow
that records a journey, gates the merge on it, diffs against the baseline, and uploads the replay
and diff as reviewer artifacts.

`proofrun diff` needs `fetch-depth: 0` on checkout; a shallow clone cannot resolve the commit range
and the report will honestly say `UNAVAILABLE`.
