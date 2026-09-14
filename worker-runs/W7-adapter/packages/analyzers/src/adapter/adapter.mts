/**
 * ProofRun analyzer boundary — the contract that lets new languages/frameworks
 * plug in without rewriting the CLI.
 *
 * Contract:
 * - Every analyzer implements Analyzer (id, fileExts, analyze).
 * - analyze(files) returns an AdapterGraph; the normalizer enforces that every
 *   node carries a source path + integer line (the "no diagram without
 *   provenance" rule) and stamps every node with its adapter id.
 * - Adapters are selected via the AnalyzerRegistry: explicit id (CLI --adapter)
 *   or inferred from the file extensions of the source being analyzed.
 * - Runtime dependencies: none. No server.
 */

export type SourceRef = { path: string; line: number; endLine?: number };
export type SourceFile = { path: string; text: string };

export type GraphNodeKind = "route" | "component" | "state" | "test" | (string & {});
export type GraphEdgeRelation = "imports" | "renders" | "uses" | "tests" | (string & {});
export type EvidenceBasis = "heuristic" | "ast" | "empirical" | "calibrated" | (string & {});

export interface AnalyzedNode {
  id: string;
  kind: GraphNodeKind;
  label: string;
  source: SourceRef;
  /** Attributed by the normalizer; which adapter produced this node. */
  adapterId?: string;
}

export interface AnalyzedEdge {
  from: string;
  to: string;
  relation: GraphEdgeRelation;
}

export interface AdapterGraph {
  basis: EvidenceBasis;
  sourceRoot?: string;
  nodes: AnalyzedNode[];
  edges: AnalyzedEdge[];
  limitations: string[];
}

/**
 * The typed boundary. A new language/framework adapter is one small object:
 *   const rustAdapter: Analyzer = {
 *     id: "rust-cargo",
 *     fileExts: ["rs"],
 *     analyze: (files) => normalize({ ... }, rustAdapter.id),
 *   };
 * and the CLI picks it up via the registry — no CLI changes.
 */
export interface Analyzer {
  /** Stable adapter identifier, e.g. "text-ts". */
  readonly id: string;
  /** Lowercase extensions (without dot) this adapter claims, e.g. ["ts", "tsx", "js", "py"]. */
  readonly fileExts: readonly string[];
  analyze(files: ReadonlyArray<SourceFile>): AdapterGraph;
}

export type FileMap = Record<string, string>;

export function toSourceFiles(files: FileMap): SourceFile[] {
  return Object.entries(files).map(([path, text]) => ({ path, text }));
}

/**
 * Enforces the provenance invariant (path + integer line per node) and stamps
 * adapter attribution. Graphs returned through this function pass
 * assertProvenance() by construction.
 */
export function normalize(graph: AdapterGraph, adapterId: string): AdapterGraph {
  const nodes = graph.nodes.map((node) => {
    const source = node?.source;
    const path = typeof source?.path === "string" ? source.path : "";
    const line = typeof source?.line === "number" ? source.line : NaN;
    if (!path || !Number.isInteger(line)) {
      throw new Error(`provenance: missing source path or line for node "${node?.id ?? "<none>"}"`);
    }
    const endLine =
      typeof source?.endLine === "number" && Number.isInteger(source.endLine)
        ? { endLine: source.endLine }
        : undefined;
    return {
      id: String(node?.id ?? path),
      kind: String(node?.kind ?? "component"),
      label: String(node?.label ?? path),
      source: { path, line, ...(endLine ? { endLine } : {}) },
      adapterId,
    };
  });
  const edges = (graph.edges ?? []).filter(
    (edge) =>
      edge &&
      typeof edge.from === "string" &&
      edge.from.length > 0 &&
      typeof edge.to === "string" &&
      edge.to.length > 0 &&
      typeof edge.relation === "string" &&
      edge.relation.length > 0,
  );
  return {
    basis: graph.basis ?? "heuristic",
    ...(graph.sourceRoot ? { sourceRoot: graph.sourceRoot } : {}),
    nodes,
    edges,
    limitations: (graph.limitations ?? []).map(String),
  };
}

/** Throws if any node lacks provenance (the CLI's pre-write gate). */
export function assertProvenance(graph: AdapterGraph): void {
  for (const node of graph.nodes) {
    const source = node?.source;
    if (!source || typeof source.path !== "string" || source.path.length === 0 || !Number.isInteger(source.line)) {
      throw new Error(`Missing provenance: ${node?.id ?? "<node>"}`);
    }
  }
}

export type FileExtToId = ReadonlyMap<string, string>;

/**
 * Registry that the CLI consumes. Adapters register here; selection is by
 * explicit id or by the extensions present in the file set (most frequent
 * wins, then registration order). Unknown ids throw with the known list.
 */
export class AnalyzerRegistry {
  private readonly byId = new Map<string, Analyzer>();

  register(analyzer: Analyzer): AnalyzerRegistry {
    if (!analyzer?.id || typeof analyzer.analyze !== "function") {
      throw new Error("AnalyzerRegistry.register: analyzer requires id and analyze()");
    }
    if (this.byId.has(analyzer.id)) {
      throw new Error(`AnalyzerRegistry: duplicate adapter id "${analyzer.id}"`);
    }
    this.byId.set(analyzer.id, analyzer);
    return this;
  }

  has(id: string): boolean {
    return this.byId.has(id);
  }

  get(id: string): Analyzer {
    const found = this.byId.get(id);
    if (!found) {
      throw new Error(`AnalyzerRegistry: unknown adapter "${id}" (known: ${[...this.byId.keys()].join(", ") || "none"})`);
    }
    return found;
  }

  /** Adapter whose claimed extension is the most frequent in `files`; falls back to `fallbackId`. */
  select(files: FileMap | ReadonlyArray<SourceFile>, fallbackId: string): Analyzer {
    const map: FileMap = Array.isArray(files) ? Object.fromEntries(files.map((f) => [f.path, f.text])) : files;
    const counts = new Map<string, number>();
    for (const path of Object.keys(map)) {
      const dot = path.lastIndexOf(".");
      if (dot < 0) continue;
      const ext = path.slice(dot + 1).toLowerCase();
      counts.set(ext, (counts.get(ext) ?? 0) + 1);
    }
    let bestId: string | undefined;
    let bestCount = -1;
    for (const adapter of this.byId.values()) {
      for (const ext of adapter.fileExts) {
        const count = counts.get(ext) ?? 0;
        if (count > bestCount) {
          bestCount = count;
          bestId = adapter.id;
        }
      }
    }
    return this.get(bestId ?? fallbackId);
  }
}

/** Default boundary registry: only the built-in generic adapter is registered. */
export function createAdapterRegistry(builtin: Analyzer): AnalyzerRegistry {
  return new AnalyzerRegistry().register(builtin);
}
