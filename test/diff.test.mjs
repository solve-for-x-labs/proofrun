import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { diffEvidence } from "../bin/diff.mjs";
import { createHash } from "node:crypto";
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWZkAAAAASUVORK5CYII=", "base64");
const hash = createHash("sha256").update(png).digest("hex");

const exec = promisify(execFile);

function manifest(head, submitStatus, submitHash) {
  return {
    kind: "proofrun-journey",
    name: "contact form",
    status: submitStatus === "PASSED" ? "PASSED" : "FAILED",
    fingerprint: { gitHead: head, uncommittedDiffSha256: "clean", workingTreeStatus: "" },
    runtime: { adapter: "playwright" },
    steps: [
      { id: "open", action: "goto", status: "PASSED", screenshot: "open.png", screenshotSha256: hash, sourceRefs: ["app/page.tsx:10"] },
      { id: "submit", action: "click", status: submitStatus, error: submitStatus === "FAILED" ? "Expected text \"Message sent\"" : null, screenshot: "submit.png", screenshotSha256: submitHash, sourceRefs: ["app/form.tsx:22"] }
    ]
  };
}

async function repoWithTwoCommits(root) {
  const repo = join(root, "repo");
  await mkdir(join(repo, "app"), { recursive: true });
  await exec("git", ["init", "-q", repo]);
  await exec("git", ["-C", repo, "config", "user.email", "t@example.com"]);
  await exec("git", ["-C", repo, "config", "user.name", "Test"]);
  await writeFile(join(repo, "app", "form.tsx"), "export const ok = 'Message sent';\n");
  await exec("git", ["-C", repo, "add", "-A"]);
  await exec("git", ["-C", repo, "commit", "-qm", "base"]);
  const { stdout: first } = await exec("git", ["-C", repo, "rev-parse", "HEAD"]);
  await writeFile(join(repo, "app", "form.tsx"), "export const ok = 'Thanks';\n");
  await exec("git", ["-C", repo, "commit", "-qam", "change success copy"]);
  const { stdout: second } = await exec("git", ["-C", repo, "rev-parse", "HEAD"]);
  return { repo, first: first.trim(), second: second.trim() };
}

test("diff marks a regression and binds it to the commits that touched the step source", async () => {
  const root = await mkdtemp(join(tmpdir(), "proofrun-diff-"));
  const { repo, first, second } = await repoWithTwoCommits(root);
  await writeFile(join(root, "open.png"), png);
  await writeFile(join(root, "submit.png"), png);
  await writeFile(join(root, "before.json"), JSON.stringify(manifest(first, "PASSED", hash)));
  await writeFile(join(root, "after.json"), JSON.stringify(manifest(second, "FAILED", hash)));

  const out = join(root, "out");
  const report = await diffEvidence(join(root, "before.json"), join(root, "after.json"), out, repo);

  assert.equal(report.status, "REGRESSION");
  assert.equal(report.summary.regressions, 1);
  assert.equal(report.summary.fixes, 0);

  const open = report.steps.find((step) => step.id === "open");
  const submit = report.steps.find((step) => step.id === "submit");
  assert.equal(open.verdict, "STABLE");
  assert.equal(open.visual, "VISUAL_IDENTICAL");
  assert.equal(submit.verdict, "REGRESSION");
  assert.equal(submit.visual, "VISUAL_IDENTICAL");

  assert.equal(report.commitRange.status, "RESOLVED");
  assert.equal(report.commitRange.commits.length, 1);
  assert.equal(report.commitRange.commits[0].subject, "change success copy");
  // Only the step that references the changed file is implicated.
  assert.deepEqual(submit.suspectCommitFiles, ["app/form.tsx"]);
  assert.deepEqual(open.suspectCommitFiles, []);

  const html = await readFile(join(out, "diff.html"), "utf8");
  assert.match(html, /media\/before-2-submit\.png/);
  assert.match(html, /media\/after-2-submit\.png/);
});

test("diff reports a fix and refuses to invent a commit range it cannot resolve", async () => {
  const root = await mkdtemp(join(tmpdir(), "proofrun-diff-fix-"));
  await writeFile(join(root, "open.png"), "screen-a");
  await writeFile(join(root, "submit.png"), "screen-b");
  await writeFile(join(root, "before.json"), JSON.stringify(manifest("a".repeat(40), "FAILED", "fail-hash")));
  await writeFile(join(root, "after.json"), JSON.stringify(manifest("b".repeat(40), "PASSED", "pass-hash")));

  const report = await diffEvidence(join(root, "before.json"), join(root, "after.json"), join(root, "out"), root);

  assert.equal(report.status, "UNVERIFIABLE");
  assert.equal(report.summary.fixes, 1);
  assert.equal(report.summary.regressions, 0);
  assert.equal(report.commitRange.status, "UNAVAILABLE");
  assert.equal(report.commitRange.commits.length, 0);
});

test("diff labels an absent visual baseline instead of claiming the screens match", async () => {
  const root = await mkdtemp(join(tmpdir(), "proofrun-diff-nohash-"));
  const bare = manifest("c".repeat(40), "PASSED", null);
  for (const step of bare.steps) { delete step.screenshotSha256; step.screenshot = null; }
  await writeFile(join(root, "before.json"), JSON.stringify(bare));
  await writeFile(join(root, "after.json"), JSON.stringify(bare));

  const report = await diffEvidence(join(root, "before.json"), join(root, "after.json"), join(root, "out"), root);

  assert.equal(report.summary.unverifiableVisuals, 2);
  assert.equal(report.status, "UNVERIFIABLE");
  assert.equal(report.commitRange.status, "UNAVAILABLE");
  assert.match(await readFile(join(root, "out", "diff.html"), "utf8"), /NO_RUNTIME_MEDIA/);
});

test("diff rejects forged visual hashes and unbacked DOM hashes", async () => {
  const root = await mkdtemp(join(tmpdir(), "proofrun-diff-forged-"));
  const data = manifest("deadbee", "PASSED", "f".repeat(64));
  await writeFile(join(root, "open.png"), png);
  await writeFile(join(root, "submit.png"), png);
  data.steps[0].screenshot = "missing.png";
  data.steps.forEach(s => { s.domSha256 = "a".repeat(64); });
  await writeFile(join(root, "before.json"), JSON.stringify(data));
  await writeFile(join(root, "after.json"), JSON.stringify(data));
  const report = await diffEvidence(join(root, "before.json"), join(root, "after.json"), join(root, "out"), root);
  assert.equal(report.status, "UNVERIFIABLE");
  assert.equal(report.summary.unverifiableVisuals, 2);
  assert.ok(report.steps.every(s => !s.before.screenshot && !s.after.screenshot));
});

test("diff rejects duplicate IDs rather than silently discarding evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "proofrun-diff-duplicates-"));
  const data = manifest(null, "PASSED", null);
  data.steps[1].id = data.steps[0].id;
  const path = join(root, "evidence.json");
  await writeFile(path, JSON.stringify(data));
  await assert.rejects(diffEvidence(path, path, join(root, "out"), root), /Duplicate step IDs/);
});
