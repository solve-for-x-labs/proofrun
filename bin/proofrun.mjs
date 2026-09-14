#!/usr/bin/env node
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { basename, extname, join, relative, resolve } from "node:path";

const VERSION = "0.3.0";
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py", ".go", ".rs", ".java", ".kt", ".swift", ".vue", ".svelte", ".php", ".rb"]);
const HELP = `ProofRun ${VERSION} — source-linked code baseline\n\nUsage:\n  proofrun baseline <source-dir> [options]\n\nOptions:\n  --out <dir>       Output directory (default: proofrun-output)\n  --format <mode>   json, html, or both (default: both)\n  --include <text>  Comma-separated path fragments to include\n  --exclude <text>  Comma-separated path fragments to exclude\n  --version         Print version\n  --help            Print this help\n\nThe baseline is deterministic heuristic analysis. It is not an AST or runtime trace.\n`;

async function walk(root, dir = root, out = {}) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.name === "node_modules" || entry.name === ".git" || entry.name.startsWith(".")) continue;
    if (entry.isDirectory()) await walk(root, path, out);
    else if (SOURCE_EXTENSIONS.has(extname(entry.name).toLowerCase())) out[relative(root, path).replaceAll("\\", "/")] = await readFile(path, "utf8");
  }
  return out;
}

function list(value) { return value ? value.split(",").map((item) => item.trim()).filter(Boolean) : []; }
function selected(path, include, exclude) { return (!include.length || include.some((item) => path.includes(item))) && !exclude.some((item) => path.includes(item)); }

function classify(path, text) {
  const lower = path.toLowerCase();
  if (/(^|\/)(test|tests|spec|__tests__)(\/|$)|\.(test|spec)\.[^.]+$/.test(lower)) return "test";
  if (/(^|\/)(state|store|reducers?)(\/|$)/.test(lower) || /\b(enum|reducer)\b/.test(text)) return "state";
  if (/(^|\/)(app|pages|routes?)(\/|$)/.test(lower) || /(^|\/)(page|layout|route)\.[^.]+$/.test(lower)) return "route";
  return "component";
}

function analyze(files) {
  const nodes = Object.entries(files).map(([path, text]) => {
    const declaration = /(?:function|class|enum|struct|module|def)\s+([A-Za-z_$][\w$]*)/.exec(text);
    return { id: path, kind: classify(path, text), label: declaration?.[1] ?? basename(path), source: { path, line: declaration ? text.slice(0, declaration.index).split("\n").length : 1 } };
  });
  const paths = new Set(nodes.map((node) => node.id));
  const edges = [];
  for (const [path, text] of Object.entries(files)) {
    const imports = [...text.matchAll(/(?:from\s*|import\s*|require\s*\(\s*)["']([^"']+)["']/g)].map((match) => match[1]);
    for (const specifier of imports) {
      if (!specifier.startsWith(".")) continue;
      const base = path.split("/").slice(0, -1).join("/");
      const candidates = [join(base, specifier), join(base, `${specifier}.ts`), join(base, `${specifier}.tsx`), join(base, `${specifier}.js`), join(base, `${specifier}.py`), join(base, `${specifier}/index.ts`), join(base, `${specifier}/page.tsx`)].map((item) => item.replaceAll("\\", "/"));
      const target = candidates.find((item) => paths.has(item));
      if (target) edges.push({ from: path, to: target, relation: classify(path, text) === "test" ? "tests" : "imports" });
    }
  }
  return { schemaVersion: "0.3", basis: "heuristic", nodes, edges, limitations: ["Regex-based import and declaration analysis; not a full AST.", "Dynamic runtime behavior and generated files are not inferred.", "Source paths are relative to the analyzed directory."] };
}

function html(graph) {
  const rows = graph.nodes.map((node) => `<li><b>${node.kind}</b> ${node.label} <code>${node.source.path}:${node.source.line}</code></li>`).join("");
  const edges = graph.edges.map((edge) => `<li><code>${edge.from}</code> → <code>${edge.to}</code> (${edge.relation})</li>`).join("");
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>ProofRun baseline</title><style>body{font:16px system-ui;max-width:960px;margin:40px auto;padding:0 16px;background:#10131a;color:#e9eef5}section{background:#191f2a;padding:20px;border-radius:12px;margin:16px 0}li{margin:9px 0}code{color:#a7d8ff;overflow-wrap:anywhere}small{color:#abb6c5}</style><h1>ProofRun baseline</h1><p>Schema ${graph.schemaVersion}. <small>Deterministic source-linked heuristic view.</small></p><section><h2>Nodes (${graph.nodes.length})</h2><ul>${rows}</ul></section><section><h2>Edges (${graph.edges.length})</h2><ul>${edges || "<li>None detected</li>"}</ul></section><section><h2>Limitations</h2><ul>${graph.limitations.map((item) => `<li>${item}</li>`).join("")}</ul></section>`;
}

async function main(argv) {
  if (argv.includes("--help") || argv.length === 0) { process.stdout.write(HELP); return; }
  if (argv.includes("--version")) { process.stdout.write(`${VERSION}\n`); return; }
  if (argv[0] !== "baseline") throw new Error("Unknown command. Run `proofrun --help`.");
  const source = resolve(argv[1] ?? "");
  const option = (name, fallback) => { const index = argv.indexOf(name); return index >= 0 ? argv[index + 1] : fallback; };
  const out = resolve(option("--out", "proofrun-output"));
  const format = option("--format", "both");
  const include = list(option("--include", "")); const exclude = list(option("--exclude", ""));
  if (!["json", "html", "both"].includes(format)) throw new Error("--format must be json, html, or both");
  if (!argv[1] || !(await stat(source).catch(() => false))) throw new Error("source-dir is required and must exist");
  const allFiles = await walk(source); const files = Object.fromEntries(Object.entries(allFiles).filter(([path]) => selected(path, include, exclude)));
  const graph = { sourceRoot: ".", ...analyze(files), filters: { include, exclude } };
  await mkdir(out, { recursive: true });
  if (format === "json" || format === "both") await writeFile(join(out, "graph.json"), JSON.stringify(graph, null, 2) + "\n");
  if (format === "html" || format === "both") await writeFile(join(out, "index.html"), html(graph));
  process.stdout.write(`ProofRun baseline written to ${out} (${graph.nodes.length} nodes, ${graph.edges.length} edges, format=${format})\n`);
}

main(process.argv.slice(2)).catch((error) => { process.stderr.write(`ProofRun error: ${error.message}\n`); process.exitCode = 1; });
