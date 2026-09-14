# W4 CLI package worker

You are a DeepSeek production worker. Work only in your assigned cwd. Do not modify the parent repo or other workers.

Design and implement a minimal npm-installable ProofRun CLI package as a patch-ready output. The existing repo is at `/Users/apple/.openclaw/workspace/proofrun`; read it for context, but write only inside your assigned cwd.

Acceptance criteria:
- package metadata suitable for `npm install -g` or `npx`, with a `bin` entry named `proofrun`.
- dependency-light executable CLI that supports `proofrun baseline <source-dir> --out <dir>` and writes a provenance graph plus standalone HTML, or gives a clear actionable error.
- no credentials, network, deployment, or public publishing.
- include a smoke test using a temporary fixture or the existing baseline fixture.
- include `RESULT.md` with STATUS, Files, Commands Run, Evidence, Known Limitations, Next Input.

Do not overbuild a web server. The CLI should reuse or faithfully port the repository's deterministic heuristic analyzer and label its limitations.
