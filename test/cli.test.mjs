import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const run = promisify(execFile);

test("installed-style CLI generates source-linked artifacts", async () => {
  const root = await mkdtemp(join(tmpdir(), "proofrun-"));
  const source = join(root, "src"); const out = join(root, "out");
  await mkdir(join(source, "app"), { recursive: true });
  await writeFile(join(source, "app/page.tsx"), "export default function Home(){ return null }\n");
  const result = await run(process.execPath, ["bin/proofrun.mjs", "baseline", source, "--out", out]);
  assert.match(result.stdout, /ProofRun baseline written/);
  assert.match(await readFile(join(out, "graph.json"), "utf8"), /Home/);
  assert.match(await readFile(join(out, "index.html"), "utf8"), /app\/page\.tsx:1/);
});
