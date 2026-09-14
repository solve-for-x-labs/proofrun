import type { AdapterGraph, AnalyzerAdapter, SourceFile } from "./adapter.ts";

export const genericAdapter: AnalyzerAdapter = {
  id: "generic-text",
  extensions: [".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs", ".java", ".swift", ".vue", ".svelte", ".php", ".rb"],
  canAnalyze(files) { return files.some((file) => this.extensions.includes(file.extension)); },
  analyze(files): AdapterGraph {
    const nodes = files.map((file) => ({ id: file.path, kind: "source", label: file.path, source: { path: file.path, line: 1 }, adapterId: "generic-text" }));
    return { schemaVersion: "0.3", basis: "heuristic", nodes, edges: [], limitations: ["Generic adapter preserves provenance but does not infer semantic edges."] };
  }
};
