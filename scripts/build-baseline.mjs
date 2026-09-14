import { mkdir, writeFile } from "node:fs/promises";
import { analyze } from "../packages/analyzers/src/visual-baseline.ts";

const files = {
  "app/page.tsx": "import { TaskList } from '../components/TaskList';\nexport default function Home(){ return <TaskList/> }\n",
  "components/TaskList.tsx": "import { taskReducer } from '../state/tasks';\nexport function TaskList(){ return null }\n",
  "state/tasks.ts": "export enum TaskStatus { Idle='idle', Ready='ready' }\n",
  "tests/tasks.test.ts": "import { TaskStatus } from '../state/tasks';\ntest('status',()=>TaskStatus.Idle)\n"
};
const graph = analyze(files);
await mkdir("artifacts/baseline", { recursive: true });
await writeFile("artifacts/baseline/graph.json", JSON.stringify(graph, null, 2) + "\n");
const rows = graph.nodes.map((n) => `<li><strong>${n.kind}</strong> ${n.label}<code>${n.source.path}:${n.source.line}</code></li>`).join("\n");
const edges = graph.edges.map((e) => `<li><code>${e.from}</code> → <code>${e.to}</code> (${e.relation})</li>`).join("\n");
await writeFile("artifacts/baseline/index.html", `<!doctype html><meta charset="utf-8"><title>ProofRun Visual Baseline</title><style>body{font:16px system-ui;max-width:900px;margin:40px auto;background:#10131a;color:#e9eef5}code{color:#a7d8ff;margin-left:12px}li{margin:9px 0}section{background:#191f2a;padding:20px;border-radius:12px;margin:16px 0}</style><h1>ProofRun visual baseline</h1><p>Basis: deterministic heuristic analysis. Every node links to source provenance.</p><section><h2>Nodes</h2><ul>${rows}</ul></section><section><h2>Edges</h2><ul>${edges}</ul></section>`);
