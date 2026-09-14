#!/usr/bin/env node
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

const usage = `ProofRun 0.2\n\nUsage:\n  proofrun baseline <source-dir> --out <output-dir>\n`;

async function walk(root, dir = root, out = {}) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    if (entry.isDirectory()) await walk(root, path, out);
    else if (/\.(tsx?|jsx?|mjs|cjs)$/.test(entry.name)) out[relative(root, path)] = await readFile(path, "utf8");
  }
  return out;
}

function analyze(files) {
  const nodes = Object.entries(files).map(([path, text]) => {
    const kind = path.includes("test") ? "test" : path.includes("state") || /enum\s+\w+/.test(text) ? "state" : path.startsWith("app/") || path.includes("/routes/") ? "route" : "component";
    const match = /(?:function|class|enum)\s+([A-Za-z_$][\w$]*)/.exec(text);
    return { id: path, kind, label: match?.[1] ?? path.split("/").pop(), source: { path, line: match ? text.slice(0, match.index).split("\n").length : 1 } };
  });
  const paths = new Set(nodes.map((node) => node.id));
  const edges = [];
  for (const [path, text] of Object.entries(files)) {
    for (const match of text.matchAll(/from\s+["']([^"']+)["']/g)) {
      if (!match[1].startsWith(".")) continue;
      const base = path.split("/").slice(0, -1).join("/");
      const candidates = [join(base, match[1]), join(base, `${match[1]}.ts`), join(base, `${match[1]}.tsx`), join(base, `${match[1]}/page.tsx`)].map((p) => p.replaceAll("\\", "/"));
      const target = candidates.find((p) => paths.has(p));
      if (target) edges.push({ from: path, to: target, relation: path.includes("test") ? "tests" : "imports" });
    }
  }
  return { basis: "heuristic", nodes, edges, limitations: ["Regex import resolution; not a full TypeScript AST.", "Dynamic runtime behavior is not inferred."] };
}

async function main(argv) {
  if (argv[0] !== "baseline") { process.stderr.write(usage); process.exitCode = 1; return; }
  const source = resolve(argv[1] ?? "");
  const outIndex = argv.indexOf("--out");
  const out = resolve(outIndex >= 0 ? argv[outIndex + 1] : "proofrun-output");
  if (!argv[1] || !argv[outIndex + 1] || !(await stat(source).catch(() => false))) throw new Error("source-dir and --out <dir> are required and source-dir must exist");
  const graph = analyze(await walk(source));
  await mkdir(out, { recursive: true });
  await writeFile(join(out, "graph.json"), JSON.stringify({ sourceRoot: source, ...graph }, null, 2) + "\n");
  const rows = graph.nodes.map((n) => `<li><b>${n.kind}</b> ${n.label} <code>${n.source.path}:${n.source.line}</code></li>`).join("");
  const links = graph.edges.map((e) => `<li><code>${e.from}</code> → <code>${e.to}</code> (${e.relation})</li>`).join("");
  await writeFile(join(out, "index.html"), `<!doctype html><meta charset="utf-8"><title>ProofRun baseline</title><style>body{font:16px system-ui;max-width:900px;margin:40px auto;background:#10131a;color:#e9eef5}section{background:#191f2a;padding:20px;border-radius:12px;margin:16px 0}li{margin:9px 0}code{color:#a7d8ff}</style><h1>ProofRun baseline</h1><p>Deterministic source-linked heuristic view.</p><section><h2>Nodes</h2><ul>${rows}</ul></section><section><h2>Edges</h2><ul>${links}</ul></section>`);
  process.stdout.write(`ProofRun baseline written to ${out} (${graph.nodes.length} nodes, ${graph.edges.length} edges)\n`);
}
main(process.argv.slice(2)).catch((error) => { process.stderr.write(`ProofRun error: ${error.message}\n`); process.exitCode = 1; });
