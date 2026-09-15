import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { verifyEvidence } from "./journey.mjs";

const exec = promisify(execFile);

// A recorded head is only a binding when it is a real commit object in this repository.
// A placeholder or a sha from an unrelated clone cannot be re-verified later.
async function commitResolves(repo, head) {
  if (!head || !/^[0-9a-f]{7,40}$/i.test(head)) return { ok: false, detail: head ? `"${head}" is not a commit sha` : "no gitHead recorded" };
  try {
    await exec("git", ["-C", repo, "cat-file", "-e", `${head}^{commit}`]);
    return { ok: true, detail: head };
  } catch {
    return { ok: false, detail: `${head} does not resolve in ${repo}` };
  }
}

const json = (value) => JSON.stringify(value, null, 2) + "\n";

function check(id, requirement, pass, detail, severity = "BLOCK") {
  return { id, requirement, status: pass ? "PASS" : severity, detail };
}

function mediaCount(evidence) {
  const steps = evidence.steps ?? [];
  const withMedia = steps.filter((step) => step.screenshot || step.video).length;
  const video = evidence.runtime?.video ?? evidence.visualEvidence?.video ?? null;
  return { steps: steps.length, withMedia, video: Boolean(video) };
}

export async function gateEvidence(evidencePath, repo, options = {}) {
  const {
    requireFresh = true,
    requireMedia = true,
    maxNetworkFailures = 0,
    maxConsoleEvents = null
  } = options;

  const evidence = JSON.parse(await readFile(evidencePath, "utf8"));
  const media = mediaCount(evidence);
  const networkFailures = (evidence.networkFailures ?? []).length;
  const consoleEvents = (evidence.console ?? []).length;
  const checks = [];

  checks.push(check(
    "run-status",
    "The recorded run must have passed its own assertions.",
    evidence.status === "PASSED",
    `status=${evidence.status ?? "UNKNOWN"}`
  ));

  let freshness = null;
  if (requireFresh) {
    freshness = await verifyEvidence(evidencePath, repo);
    checks.push(check(
      "freshness",
      "Evidence must still match the current Git state of the repository.",
      freshness.status === "FRESH",
      `${freshness.status} · evidence head=${freshness.expected?.gitHead ?? "UNBOUND"} · current head=${freshness.current?.gitHead ?? "UNBOUND"}`
    ));
  } else {
    checks.push(check("freshness", "Freshness re-verification was explicitly skipped.", false, "skipped by --no-fresh — this evidence was not re-checked against the repository", "WARN"));
  }

  const binding = await commitResolves(repo, evidence.fingerprint?.gitHead ?? evidence.source?.gitHead ?? null);
  checks.push(check(
    "git-binding",
    "Evidence must be bound to a commit that resolves in this repository, otherwise it cannot be re-verified.",
    binding.ok,
    binding.detail
  ));

  checks.push(check(
    "clean-tree",
    "A dirty working tree means the run is not reproducible from the commit alone.",
    !evidence.fingerprint?.workingTreeStatus,
    evidence.fingerprint?.workingTreeStatus ? "working tree had uncommitted changes during capture" : "clean at capture time",
    "WARN"
  ));

  if (requireMedia) {
    checks.push(check(
      "runtime-media",
      "Every recorded step must carry real captured media, never a synthetic stand-in.",
      media.steps > 0 && media.withMedia === media.steps,
      `${media.withMedia}/${media.steps} steps have media · video=${media.video ? "yes" : "no"}`
    ));
  }

  checks.push(check(
    "network-failures",
    `Network failures must not exceed ${maxNetworkFailures}.`,
    networkFailures <= maxNetworkFailures,
    `${networkFailures} network failure(s)`
  ));

  if (maxConsoleEvents !== null) {
    checks.push(check(
      "console-events",
      `Console events must not exceed ${maxConsoleEvents}.`,
      consoleEvents <= maxConsoleEvents,
      `${consoleEvents} console event(s)`
    ));
  }

  const blocking = checks.filter((item) => item.status === "BLOCK");
  const warnings = checks.filter((item) => item.status === "WARN");
  const decision = blocking.length ? "BLOCK" : "ALLOW";
  const report = {
    schemaVersion: "0.1",
    kind: "proofrun-merge-gate",
    createdAt: new Date().toISOString(),
    decision,
    evidence: { path: evidencePath, name: evidence.name ?? null, kind: evidence.kind ?? null, status: evidence.status ?? null },
    repo: resolve(repo),
    policy: { requireFresh, requireMedia, maxNetworkFailures, maxConsoleEvents },
    checks,
    blocking: blocking.map((item) => item.id),
    warnings: warnings.map((item) => item.id),
    freshness,
    limitations: [
      "ALLOW means the declared policy held for this evidence bundle. It is not a correctness claim about the product.",
      "The gate reads recorded evidence. It does not re-execute the journey."
    ]
  };
  await writeFile(join(dirname(resolve(evidencePath)), "gate.json"), json(report));
  return report;
}
