import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mergeEvidence } from "../bin/merge.mjs";

test("merge creates one visual cross-surface admin bundle", async () => {
  const root = await mkdtemp(join(tmpdir(), "proofrun-merge-"));
  await writeFile(join(root, "web.png"), "web-media");
  await writeFile(join(root, "mobile.png"), "mobile-media");
  await writeFile(join(root, "web.json"), JSON.stringify({
    kind: "proofrun-journey", name: "Web", status: "PASSED",
    fingerprint: { gitHead: "abc" }, runtime: { adapter: "playwright" },
    steps: [{ id: "home", status: "PASSED", screenshot: "web.png" }]
  }));
  await writeFile(join(root, "mobile.json"), JSON.stringify({
    kind: "proofrun-mobile-evidence", name: "Mobile", status: "PASSED",
    source: { gitHead: "def" }, runtime: { adapter: "maestro", platform: "ios" },
    steps: [{ id: "launch", status: "PASSED", screenshot: "mobile.png" }]
  }));
  const out = join(root, "out");
  const result = await mergeEvidence([join(root, "web.json"), join(root, "mobile.json")], out);
  assert.equal(result.status, "READY");
  assert.match(await readFile(join(out, "admin.html"), "utf8"), /실제 화면과 실행 증거/);
  assert.equal((await readFile(join(out, "evidence-bundle.json"), "utf8")).includes("maestro"), true);
});
