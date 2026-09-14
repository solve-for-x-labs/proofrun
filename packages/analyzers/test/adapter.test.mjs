import test from "node:test";
import assert from "node:assert/strict";
import { AdapterRegistry, genericAdapter } from "../src/adapter/index.ts";

test("adapter registry selects a provenance-preserving generic adapter", () => {
  const registry = new AdapterRegistry([genericAdapter]);
  const adapter = registry.select([{ path: "main.py", text: "def main(): pass", extension: ".py" }], "generic-text");
  const graph = adapter.analyze([{ path: "main.py", text: "def main(): pass", extension: ".py" }]);
  assert.equal(adapter.id, "generic-text");
  assert.equal(graph.nodes[0].source.path, "main.py");
  assert.equal(graph.nodes[0].adapterId, "generic-text");
});
