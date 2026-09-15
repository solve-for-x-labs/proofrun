#!/usr/bin/env node
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { basename, extname, join, relative, resolve } from "node:path";
import { readFileSync } from "node:fs";

const VERSION = (() => { try { return JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version; } catch { return "0.0.0-unpackaged"; } })();
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py", ".go", ".rs", ".java", ".kt", ".swift", ".vue", ".svelte", ".php", ".rb"]);
const HELP = `ProofRun ${VERSION} — source-linked evidence for agentic software work\n\nUsage:\n  proofrun baseline <source-dir> [options]\n  proofrun journey <journey.json> --out <dir> --repo <source-dir>\n  proofrun verify <evidence.json> --repo <source-dir>\n\nBaseline options:\n  --out <dir>       Output directory (default: proofrun-output)\n  --format <mode>   json, html, or both (default: both)\n  --include <text>  Comma-separated path fragments to include\n  --exclude <text>  Comma-separated path fragments to exclude\n\nJourney requires optional Playwright: npm install -D playwright && npx playwright install chromium\nIt captures real browser screens, console/network failures, step assertions, and Git freshness.\n\n  --version         Print version\n  --help            Print this help\n`;
const MERGE_HELP = `\n  proofrun merge <evidence.json>... --out <dir>\n  proofrun diff <before-evidence.json> <after-evidence.json> --out <dir> --repo <source-dir>\n  proofrun gate <evidence.json> --repo <source-dir> [policy]\n\nMerge combines web/mobile runtime manifests into one visual admin viewer.\n\nDiff replays the same journey at two commits side by side and marks each step\nREGRESSION, FIX, STILL_FAILING, or STABLE, with the commits in between and the\nchanged files the step actually references. Exit 3 when a regression is found.\n\nGate options (CI):\n  --no-fresh                 Skip Git freshness re-verification (recorded as a warning)\n  --allow-missing-media      Do not block when a step has no captured media\n  --max-network-failures <n> Allowed network failures (default: 0)\n  --max-console-events <n>   Allowed console events (default: unchecked)\n\nExit codes: 0 pass, 1 error, 2 stale evidence, 3 gate blocked or regression found.\n`;

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
  const data = JSON.stringify(graph).replaceAll("<", "\\u003c");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>ProofRun · Visual Evidence Report</title>
<style>:root{--bg:#08111f;--panel:#101d31;--line:#27415f;--text:#e9f2ff;--muted:#91a6c4;--blue:#69b7ff;--green:#56d6a0;--amber:#ffc266}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 15% 0,#17345b,#08111f 45%);color:var(--text);font:15px/1.5 system-ui,sans-serif}.shell{max-width:1440px;margin:auto;padding:28px 22px 60px}.top{display:flex;justify-content:space-between;gap:20px;align-items:flex-start}.eyebrow{color:var(--blue);font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase}.top h1{font-size:34px;margin:8px 0}.sub{color:var(--muted);max-width:760px}.badge{border:1px solid #2e8068;background:#12392f;color:#8ff0c5;border-radius:999px;padding:7px 12px;font-size:12px;font-weight:800}.panel{background:linear-gradient(145deg,#12233b,#0d192b);border:1px solid #203a59;border-radius:18px;padding:20px;box-shadow:0 18px 50px #0005;margin-top:16px}.decision{display:grid;grid-template-columns:1fr auto;gap:18px;align-items:center}.decision h2{font-size:23px;margin:6px 0}.muted,small{color:var(--muted)}.metrics{display:grid;grid-template-columns:repeat(4,110px);gap:10px}.metric{background:#0b1728;border:1px solid var(--line);border-radius:12px;padding:12px}.metric strong{display:block;font-size:25px}.metric span{color:var(--muted);font-size:11px}.actions{display:flex;gap:8px;margin-top:15px;flex-wrap:wrap}button{border:1px solid #31577d;border-radius:9px;padding:8px 12px;color:var(--text);background:#142a45;cursor:pointer}.primary{background:#216a57;border-color:#48b789}.tabs{display:flex;gap:8px;margin-bottom:12px}.tab.active{background:#20436a}.canvas{height:405px;overflow:hidden;background:#091525;border:1px solid var(--line);border-radius:12px}.canvas svg{width:100%;height:100%}.edge{stroke:#416383;stroke-width:1.4;opacity:.75}.node{cursor:pointer}.node circle{fill:#1b385b;stroke:var(--blue);stroke-width:2}.node[data-kind="test"] circle{fill:#214b43;stroke:var(--green)}.node[data-kind="route"] circle{fill:#513e22;stroke:var(--amber)}.node text{fill:#e6f2ff;font-size:11px}.list{display:flex;flex-direction:column;gap:8px;max-height:370px;overflow:auto}.item{padding:11px 12px;border:1px solid var(--line);background:#0c192b;border-radius:10px;margin:8px 0}.item b{display:block}.mono{font:12px ui-monospace,monospace;color:#b8dcff}.split{display:grid;grid-template-columns:1fr 1fr;gap:16px}.timeline{display:grid;grid-template-columns:repeat(5,1fr);gap:8px}.step{border-top:3px solid var(--blue);padding:10px 8px;background:#0c192b;border-radius:8px}.step:nth-child(2){border-color:#927dff}.step:nth-child(3){border-color:var(--amber)}.step:nth-child(4){border-color:#ff8c66}.step:nth-child(5){border-color:var(--green)}.step span{display:block;color:var(--muted);font-size:11px;margin-top:5px}.notice{border-left:3px solid var(--amber);background:#2a2112;color:#ffe0a6;padding:12px 14px;border-radius:8px}.foot{color:var(--muted);font-size:12px}@media(max-width:900px){.top,.decision{display:block}.metrics{grid-template-columns:repeat(2,1fr);margin-top:16px}.split{grid-template-columns:1fr}.timeline{grid-template-columns:1fr 1fr}}</style></head>
<body><main class="shell"><header class="top"><div><div class="eyebrow">ProofRun · Visual Truth Layer</div><h1>Evidence, not claims.</h1><p class="sub">A decision surface for source structure, runtime evidence, risk, and human review. Text is a fallback; this visual report is the primary output.</p></div><div class="badge">● VERIFIED · SOURCE BASELINE</div></header>
<section class="panel decision"><div><div class="eyebrow">Decision card</div><h2>Baseline ready for visual review</h2><p class="muted">Deterministic source-linked heuristic graph. Runtime behavior is deliberately not inferred.</p><div class="actions"><button class="primary" onclick="document.getElementById('evidence').scrollIntoView({behavior:'smooth'})">Review evidence</button><button onclick="downloadGraph()">Download JSON</button><button onclick="window.print()">Print report</button></div></div><div class="metrics"><div class="metric"><strong>${graph.nodes.length}</strong><span>source nodes</span></div><div class="metric"><strong>${graph.edges.length}</strong><span>detected edges</span></div><div class="metric"><strong>0</strong><span>runtime traces</span></div><div class="metric"><strong>30s</strong><span>review target</span></div></div></section>
<section class="panel" id="evidence"><div class="tabs"><button class="tab active" onclick="tab('map',this)">Architecture map</button><button class="tab" onclick="tab('source',this)">Source evidence</button><button class="tab" onclick="tab('limits',this)">Limitations</button></div><div id="map"><h2>Source map · click a node for provenance</h2><div class="canvas"><svg id="graph" viewBox="0 0 1000 405" role="img" aria-label="Source architecture graph"></svg></div></div><div id="source" hidden><h2>Source-linked evidence</h2><div class="list">${graph.nodes.slice(0,120).map((node) => `<div class="item"><b>${escapeHtml(node.label)} <span class="mono">${escapeHtml(node.kind)}</span></b><small>${escapeHtml(node.source.path)}:${node.source.line}</small></div>`).join("")}</div></div><div id="limits" hidden><h2>What this report does not claim</h2><div class="notice">${graph.limitations.map((item) => `<div>• ${escapeHtml(item)}</div>`).join("")}</div></div></section>
<section class="split"><section class="panel"><h2>Review timeline</h2><div class="timeline"><div class="step"><b>01 · Intent</b><span>source selected</span></div><div class="step"><b>02 · Analyze</b><span>nodes extracted</span></div><div class="step"><b>03 · Link</b><span>imports resolved</span></div><div class="step"><b>04 · Observe</b><span>runtime missing</span></div><div class="step"><b>05 · Decide</b><span>human review</span></div></div></section><section class="panel"><h2>Risk & forecast</h2><div class="item"><b>Blast radius <span class="mono">LOW · baseline only</span></b><small>No code was changed by this report.</small></div><div class="item"><b>Human review ETA</b><small>30 sec target · prior only · uncertainty high</small></div></section></section><p class="foot">Schema ${graph.schemaVersion} · Visual evidence is conservative: PASS requires runtime verification and matching provenance.</p></main>
<script>const DATA=${data};function escapeHtml(value){return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}function tab(id,button){for(const name of ['map','source','limits'])document.getElementById(name).hidden=name!==id;document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));button.classList.add('active');if(id==='map')draw()}function downloadGraph(){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(DATA,null,2)],{type:'application/json'}));a.download='proofrun-graph.json';a.click()}function draw(){const svg=document.getElementById('graph'),ns='http://www.w3.org/2000/svg',nodes=DATA.nodes.slice(0,80),cols=8,pos=new Map();svg.innerHTML='';nodes.forEach((n,i)=>pos.set(n.id,{x:75+(i%cols)*122,y:55+Math.floor(i/cols)*42}));DATA.edges.forEach(e=>{const a=pos.get(e.from),b=pos.get(e.to);if(!a||!b)return;const l=document.createElementNS(ns,'line');l.setAttribute('x1',a.x);l.setAttribute('y1',a.y);l.setAttribute('x2',b.x);l.setAttribute('y2',b.y);l.setAttribute('class','edge');svg.appendChild(l)});nodes.forEach(n=>{const p=pos.get(n.id),g=document.createElementNS(ns,'g');g.setAttribute('class','node');g.dataset.kind=n.kind;g.innerHTML='<circle cx="'+p.x+'" cy="'+p.y+'" r="15"></circle><text x="'+(p.x-48)+'" y="'+(p.y+30)+'">'+escapeHtml(n.label.slice(0,14))+'</text>';g.onclick=()=>alert(n.source.path+':'+n.source.line+'\\n'+n.kind);svg.appendChild(g)})}draw();</script></body></html>`;
}

function escapeHtml(value) { return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]); }

async function main(argv) {
  if (argv.includes("--help") || argv.length === 0) { process.stdout.write(HELP + MERGE_HELP); return; }
  if (argv.includes("--version")) { process.stdout.write(`${VERSION}\n`); return; }
  if (argv[0] === "journey" || argv[0] === "verify") {
    const module = await import("./journey.mjs");
    if (argv[0] === "journey") {
      const spec = resolve(argv[1] ?? "");
      const option = (name, fallback) => { const index = argv.indexOf(name); return index >= 0 ? argv[index + 1] : fallback; };
      const result = await module.runJourney(spec, resolve(option("--out", "proofrun-journey")), resolve(option("--repo", process.cwd())));
      process.stdout.write(`ProofRun journey ${result.status}: ${resolve(option("--out", "proofrun-journey"))}/replay.html\n`);
      return;
    }
    const option = (name, fallback) => { const index = argv.indexOf(name); return index >= 0 ? argv[index + 1] : fallback; };
    const result = await module.verifyEvidence(resolve(argv[1] ?? ""), resolve(option("--repo", process.cwd())));
    process.stdout.write(`ProofRun evidence ${result.status}\n`);
    if (result.status !== "FRESH") process.exitCode = 2;
    return;
  }
  if (argv[0] === "merge") {
    const module = await import("./merge.mjs");
    const option = (name, fallback) => { const index = argv.indexOf(name); return index >= 0 ? argv[index + 1] : fallback; };
    const out = resolve(option("--out", "proofrun-admin"));
    const inputs = argv.slice(1).filter((item, index, all) => !item.startsWith("--") && (index === 0 || all[index - 1] !== "--out"));
    if (!inputs.length) throw new Error("merge requires at least one evidence.json");
    const result = await module.mergeEvidence(inputs.map((item) => resolve(item)), out);
    process.stdout.write(`ProofRun merge ${result.status}: ${out}/admin.html\n`);
    return;
  }
  if (argv[0] === "diff") {
    const module = await import("./diff.mjs");
    const option = (name, fallback) => { const index = argv.indexOf(name); return index >= 0 ? argv[index + 1] : fallback; };
    const positional = argv.slice(1).filter((item, index, all) => !item.startsWith("--") && !String(all[index - 1] ?? "").startsWith("--"));
    if (positional.length < 2) throw new Error("diff requires <before-evidence.json> <after-evidence.json>");
    const out = resolve(option("--out", "proofrun-diff"));
    const report = await module.diffEvidence(resolve(positional[0]), resolve(positional[1]), out, resolve(option("--repo", process.cwd())));
    const { regressions, fixes, visualChanges, steps } = report.summary;
    process.stdout.write(`ProofRun diff ${report.status}: ${steps} steps · ${regressions} regression(s) · ${fixes} fix(es) · ${visualChanges} visual change(s)\n${out}/diff.html\n`);
    if (regressions > 0) process.exitCode = 3;
    return;
  }
  if (argv[0] === "gate") {
    const module = await import("./gate.mjs");
    const option = (name, fallback) => { const index = argv.indexOf(name); return index >= 0 ? argv[index + 1] : fallback; };
    const report = await module.gateEvidence(resolve(argv[1] ?? ""), resolve(option("--repo", process.cwd())), {
      requireFresh: !argv.includes("--no-fresh"),
      requireMedia: !argv.includes("--allow-missing-media"),
      maxNetworkFailures: Number(option("--max-network-failures", 0)),
      maxConsoleEvents: argv.includes("--max-console-events") ? Number(option("--max-console-events", 0)) : null
    });
    for (const item of report.checks) process.stdout.write(`  ${item.status.padEnd(5)} ${item.id} — ${item.detail}\n`);
    process.stdout.write(`ProofRun gate ${report.decision}${report.blocking.length ? `: ${report.blocking.join(", ")}` : ""}\n`);
    if (report.decision === "BLOCK") process.exitCode = 3;
    return;
  }
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
