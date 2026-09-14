# Journey Replay

ProofRun's useful unit is not an initial screenshot. It is a reproducible user journey:

```text
requirement → action → actual screen → assertion → console/network → source/Git state
```

## Evidence contract

Each run writes:

- `evidence.json`: normalized steps, assertion results, console/network failures, runtime, Git HEAD, and diff hash
- `screens/*.png`: one screenshot after every attempted step, including the first failed step
- `replay.html`: visual replay UI with step selection and the actual screenshot as the primary surface
- `verification.json`: `FRESH` or `STALE_REVERIFY_REQUIRED` against the current repository

## Why the tool stops at the first failure

Continuing after a failed assertion can produce misleading downstream screenshots. The first
divergence is the valuable debugging artifact. A later run can continue by fixing the spec or
adding an explicit recovery action.

## What this does not claim

`PASSED` means the configured actions and assertions passed in the captured browser session. It
does not mean the product is correct, accessible, secure, or ready to deploy. Independent review,
domain-specific checks, and CI policy remain separate gates.
