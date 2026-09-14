export type AnalysisBasis = "heuristic" | "ast" | "runtime";

export interface SourceFile { path: string; text: string; extension: string; }
export interface SourceNode { id: string; kind: string; label: string; source: { path: string; line: number; endLine?: number }; adapterId: string; }
export interface SourceEdge { from: string; to: string; relation: string; adapterId: string; }
export interface AdapterGraph { schemaVersion: string; basis: AnalysisBasis; nodes: SourceNode[]; edges: SourceEdge[]; limitations: string[]; }
export interface AnalyzerAdapter { id: string; extensions: readonly string[]; canAnalyze(files: readonly SourceFile[]): boolean; analyze(files: readonly SourceFile[]): AdapterGraph; }

export class AdapterRegistry {
  #adapters: AnalyzerAdapter[];
  constructor(adapters: readonly AnalyzerAdapter[] = []) { this.#adapters = [...adapters]; }
  register(adapter: AnalyzerAdapter): this { this.#adapters.push(adapter); return this; }
  select(files: readonly SourceFile[], fallback: string): AnalyzerAdapter {
    return this.#adapters.find((adapter) => adapter.canAnalyze(files)) ?? this.get(fallback);
  }
  get(id: string): AnalyzerAdapter {
    const adapter = this.#adapters.find((candidate) => candidate.id === id);
    if (!adapter) throw new Error(`Unknown analyzer adapter: ${id}`);
    return adapter;
  }
  list(): string[] { return this.#adapters.map((adapter) => adapter.id); }
}
