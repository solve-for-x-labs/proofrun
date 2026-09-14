import test from "node:test";
import assert from "node:assert/strict";
import { analyze, assertProvenance } from "../src/visual-baseline.ts";

test("visual graph covers required kinds and provenance", () => {
  const graph = analyze({
    "app/page.tsx": "import { TaskList } from '../components/TaskList'; export default function Home(){ return <TaskList/> }",
    "components/TaskList.tsx": "import { taskReducer } from '../state/tasks'; export function TaskList(){ return null }",
    "state/tasks.ts": "export enum TaskStatus { Idle='idle' }",
    "tests/tasks.test.ts": "import { TaskStatus } from '../state/tasks'; test('status',()=>TaskStatus.Idle)"
  });
  assertProvenance(graph);
  assert.deepEqual(new Set(graph.nodes.map((n) => n.kind)), new Set(["route", "component", "state", "test"]));
});
