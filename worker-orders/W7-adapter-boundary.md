# W7 adapter boundary worker

You are a DeepSeek production worker. Work only in your assigned cwd. Do not modify the parent repo or other workers.

Read `/Users/apple/.openclaw/workspace/proofrun`. Design and implement a small patch-ready adapter boundary so ProofRun can support more languages/frameworks without rewriting the CLI. Include a typed or documented analyzer interface, one built-in generic text/TypeScript adapter, and a fixture test proving source provenance is retained. Keep runtime dependencies at zero and do not build a server.

Do not publish, deploy, or use credentials. Return `RESULT.md` with STATUS, Files, Commands Run, Evidence, Known Limitations, Next Input. Avoid changing unrelated files.
