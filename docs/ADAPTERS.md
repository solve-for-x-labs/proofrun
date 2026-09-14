# Analyzer adapter boundary

The public CLI currently uses a dependency-free generic analyzer. Its contract is deliberately
small so language-specific adapters can be added without changing the review protocol:

```text
source files -> adapter -> {nodes, edges, source provenance, limitations}
             -> stable graph schema -> JSON / HTML / future CI sinks
```

An adapter must:

1. declare the file extensions or repository markers it understands;
2. return relative source paths and line/range provenance for every node;
3. label its analysis basis (`heuristic`, `ast`, or `runtime`);
4. report limitations instead of guessing dynamic behavior;
5. remain read-only and deterministic for the same source snapshot.

The next adapters should be implemented in this order:

1. TypeScript/JavaScript AST adapter;
2. Python AST adapter;
3. Git diff/blast-radius adapter;
4. runtime trace adapter;
5. framework adapters such as Next.js, React Native, and FastAPI.

The core does not rebuild LangGraph, Temporal, Langfuse, or a full IDE. Those systems can be
connected later as execution, durability, observability, or UI adapters.
