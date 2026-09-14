export type VisualNodeKind = "route" | "component" | "state" | "test";

export interface SourceRef { path: string; line: number; endLine?: number; }
export interface VisualNode { id: string; kind: VisualNodeKind; label: string; source: SourceRef; }
export interface VisualEdge { from: string; to: string; relation: "imports" | "renders" | "uses" | "tests"; }
export interface VisualGraph { basis: "heuristic"; sourceRoot: string; nodes: VisualNode[]; edges: VisualEdge[]; limitations: string[]; }

const IMPORT_RE = /import[^\n]*?from\s+["']([^"']+)["']/g;
const decl = /(?:export\s+)?(?:default\s+)?(?:function|class)\s+([A-Za-z_$][\w$]*)/;
const lineOf = (text: string, index: number) => text.slice(0, index).split("\n").length;

export function analyze(files: Record<string, string>): VisualGraph {
  const nodes: VisualNode[] = [];
  const edges: VisualEdge[] = [];
  const byPath = new Map<string, string>();
  for (const [path, text] of Object.entries(files)) {
    const kind: VisualNodeKind = path.includes("tests/") ? "test" : path.includes("state/") ? "state" : path.startsWith("app/") ? "route" : "component";
    const match = decl.exec(text) ?? /export\s+enum\s+([A-Za-z_$][\w$]*)/.exec(text);
    const label = match?.[1] ?? path.split("/").pop()?.replace(/\.[^.]+$/, "") ?? path;
    const node = { id: path, kind, label, source: { path, line: match ? lineOf(text, match.index) : 1 } };
    nodes.push(node); byPath.set(path, node.id);
  }
  for (const [path, text] of Object.entries(files)) {
    for (const match of text.matchAll(IMPORT_RE)) {
      const spec = match[1];
      if (!spec.startsWith(".")) continue;
      const base = path.split("/").slice(0, -1).join("/");
      const candidates = [base + "/" + spec, base + "/" + spec + ".ts", base + "/" + spec + ".tsx", base + "/" + spec + "/page.tsx"];
      const target = candidates.find((candidate) => byPath.has(candidate));
      if (target) edges.push({ from: path, to: target, relation: path.includes("tests/") ? "tests" : "imports" });
    }
  }
  return { basis: "heuristic", sourceRoot: ".", nodes, edges, limitations: ["Import resolution is extension-aware regex analysis, not a full TypeScript AST.", "Dynamic runtime edges are not inferred."] };
}

export function assertProvenance(graph: VisualGraph): void {
  for (const node of graph.nodes) if (!node.source?.path || !Number.isInteger(node.source.line)) throw new Error(`Missing provenance: ${node.id}`);
}
