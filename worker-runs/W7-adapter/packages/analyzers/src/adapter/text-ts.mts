/**
 * Built-in generic text/TypeScript adapter.
 *
 * Faithful, dependency-free port of the CLI's inline `analyze()` (bin/proofrun.mjs)
 * so that `proofrun baseline` output is byte-identical whether it goes through the
 * legacy path or the adapter boundary. This is the default adapter and the
 * reference implementation that new language adapters are modeled on.
 */
import { join } from "node:path";
import { normalize, type AnalyzedEdge, type AnalyzedNode, type Analyzer, type FileMap } from "./adapter.mts";

export const TEXT_TS_ADAPTER_ID = "text-ts";

function lineOf(text: string, index: number): number {
  return text.slice(0, index).split("\n").length;
}

function analyzeTextTs(files: FileMap): { nodes: AnalyzedNode[]; edges: AnalyzedEdge[] } {
  const nodes: AnalyzedNode[] = Object.entries(files).map(([path, text]) => {
    const kind =
      path.includes("test")
        ? "test"
        : path.includes("state") || /enum\s+\w+/.test(text)
          ? "state"
          : path.startsWith("app/") || path.includes("/routes/")
            ? "route"
            : "component";
    const match = /(?:function|class|enum)\s+([A-Za-z_$][\w$]*)/.exec(text);
    return {
      id: path,
      kind,
      label: match?.[1] ?? path.split("/").pop(),
      source: { path, line: match ? lineOf(text, match.index) : 1 },
    };
  });

  const paths = new Set(nodes.map((node) => node.id));
  const edges: AnalyzedEdge[] = [];
  for (const [path, text] of Object.entries(files)) {
    for (const match of text.matchAll(/from\s+["']([^"']+)["']/g)) {
      const spec = match[1];
      if (!spec.startsWith(".")) continue;
      const base = path.split("/").slice(0, -1).join("/");
      const candidates = [join(base, spec), join(base, `${spec}.ts`), join(base, `${spec}.tsx`), join(base, `${spec}/page.tsx`)].map((p) =>
        p.replaceAll("\\", "/"),
      );
      const target = candidates.find((p) => paths.has(p));
      if (target) edges.push({ from: path, to: target, relation: path.includes("test") ? "tests" : "imports" });
    }
  }
  return { nodes, edges };
}

const LIMITATIONS = [
  "Generic text/TypeScript adapter: node kinds and import edges are heuristic (regex), not a full TypeScript AST.",
  "Dynamic runtime edges are not inferred.",
];

function analyze(files: FileMap) {
  const { nodes, edges } = analyzeTextTs(files);
  return normalize({ basis: "heuristic", nodes, edges, limitations: LIMITATIONS }, TEXT_TS_ADAPTER_ID);
}

/** The one built-in adapter. New languages/frameworks add sibling adapters here. */
export const textTsAdapter: Analyzer = {
  id: TEXT_TS_ADAPTER_ID,
  fileExts: ["ts", "tsx", "js", "jsx", "mjs", "cjs"],
  analyze: (sources) => analyze(Object.fromEntries(sources.map((s) => [s.path, s.text]))),
};
