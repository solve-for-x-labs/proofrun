import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gateEvidence } from "../bin/gate.mjs";

const exec = promisify(execFile);

async function repoAtHead(root) {
  const repo = join(root, "repo");
  await mkdir(repo, { recursive: true });
  await exec("git", ["init", "-q", repo]);
  await exec("git", ["-C", repo, "config", "user.email", "t@example.com"]);
  await exec("git", ["-C", repo, "config", "user.name", "Test"]);
  await writeFile(join(repo, "app.txt"), "one\n");
  await exec("git", ["-C", repo, "add", "-A"]);
  await exec("git", ["-C", repo, "commit", "-qm", "base"]);
  const { stdout } = await exec("git", ["-C", repo, "rev-parse", "HEAD"]);
  return { repo, head: stdout.trim() };
}

function evidence(head, diffSha, overrides = {}) {
  return {
    kind: "proofrun-journey",
    name: "contact form",
    status: "PASSED",
    fingerprint: { repo: ".", gitHead: head, uncommittedDiffSha256: diffSha, workingTreeStatus: "" },
    runtime: { adapter: "playwright", video: "video/run.webm" },
    steps: [{ id: "open", status: "PASSED", screenshot: "screens/01.png" }],
    console: [],
    networkFailures: [],
    ...overrides
  };
}

async function currentDiffSha(repo, root) {
  // Capture the same fingerprint the journey recorder would write for a clean tree.
  const probe = join(root, "probe.json");
  await writeFile(probe, JSON.stringify(evidence("0".repeat(40), "unknown")));
  const { verifyEvidence } = await import("../bin/journey.mjs");
  const result = await verifyEvidence(probe, repo);
  return result.current.uncommittedDiffSha256;
}

test("gate allows fresh, passing, media-backed evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "proofrun-gate-ok-"));
  const { repo, head } = await repoAtHead(root);
  const path = join(root, "evidence.json");
  await writeFile(path, JSON.stringify(evidence(head, await currentDiffSha(repo, root))));

  const report = await gateEvidence(path, repo);

  assert.equal(report.decision, "ALLOW");
  assert.deepEqual(report.blocking, []);
  assert.equal(report.checks.find((c) => c.id === "freshness").status, "PASS");
  assert.equal(JSON.parse(await readFile(join(root, "gate.json"), "utf8")).decision, "ALLOW");
});

test("gate blocks a passing run whose evidence no longer matches the repository", async () => {
  const root = await mkdtemp(join(tmpdir(), "proofrun-gate-stale-"));
  const { repo, head } = await repoAtHead(root);
  const path = join(root, "evidence.json");
  await writeFile(path, JSON.stringify(evidence(head, "captured-before-the-edit")));

  const report = await gateEvidence(path, repo);

  assert.equal(report.decision, "BLOCK");
  assert.ok(report.blocking.includes("freshness"));
});

test("gate blocks evidence bound to a commit that does not exist here", async () => {
  const root = await mkdtemp(join(tmpdir(), "proofrun-gate-binding-"));
  const { repo } = await repoAtHead(root);
  const path = join(root, "evidence.json");
  await writeFile(path, JSON.stringify(evidence("<commit-sha>", "any")));

  const report = await gateEvidence(path, repo, { requireFresh: false });

  assert.equal(report.decision, "BLOCK");
  assert.ok(report.blocking.includes("git-binding"));
});

test("gate blocks a step with no captured media and reports the policy it applied", async () => {
  const root = await mkdtemp(join(tmpdir(), "proofrun-gate-media-"));
  const { repo, head } = await repoAtHead(root);
  const path = join(root, "evidence.json");
  await writeFile(path, JSON.stringify(evidence(head, "any", {
    steps: [{ id: "open", status: "PASSED" }],
    networkFailures: [{ url: "https://api.example.com", failure: "net::ERR_FAILED" }]
  })));

  const blocked = await gateEvidence(path, repo, { requireFresh: false });
  assert.equal(blocked.decision, "BLOCK");
  assert.ok(blocked.blocking.includes("runtime-media"));
  assert.ok(blocked.blocking.includes("network-failures"));

  const relaxed = await gateEvidence(path, repo, { requireFresh: false, requireMedia: false, maxNetworkFailures: 1 });
  assert.deepEqual(relaxed.blocking, []);
  assert.equal(relaxed.policy.maxNetworkFailures, 1);
  assert.ok(relaxed.warnings.includes("freshness"));
});
