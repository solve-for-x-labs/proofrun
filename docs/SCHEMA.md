# Graph schema v0.3

`graph.json` is the stable boundary between analysis and reviewer surfaces.

```json
{
  "schemaVersion": "0.3",
  "sourceRoot": ".",
  "basis": "heuristic",
  "nodes": [{
    "id": "relative/path.ts",
    "kind": "route|component|state|test",
    "label": "Human label",
    "source": {"path": "relative/path.ts", "line": 1}
  }],
  "edges": [{"from": "a.ts", "to": "b.ts", "relation": "imports|tests"}],
  "limitations": ["..."],
  "filters": {"include": [], "exclude": []}
}
```

Consumers must treat `basis` and `limitations` as part of the evidence. A heuristic graph
must not be presented as an AST or runtime trace. Adapters may add fields, but should preserve
the provenance shape and schema version their output implements.
