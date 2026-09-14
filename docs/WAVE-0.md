# Wave 0 Contract

## Representative task

Add a small health route to a fixture Next.js application, run tests and typecheck, show the source-linked change surface, and produce a reversible evidence package.

## Non-goals

- No public deployment.
- No external API calls.
- No customer data.
- No autonomous merge.

## Acceptance criteria

1. Baseline architecture and route map identify source files.
2. Every run has a fingerprint and run ID.
3. Three repeated failures trigger the circuit breaker.
4. The changed route and dependent modules are visible in the change surface.
5. Human decision has approve/reject/revise/rollback options.
6. Tests and rollback reference are included in the evidence manifest.
