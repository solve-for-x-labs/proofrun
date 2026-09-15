import { readFile, writeFile, realpath, stat } from "node:fs/promises";
import { dirname, join, resolve, relative, isAbsolute } from "node:path";
import { createHash } from "node:crypto";
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

// Integrity is not authenticity: these checks cannot prove who captured the bytes.
export async function verifiedMedia(path, manifestPath, expectedHash) {
  try {
    if (typeof path !== "string" || !path || isAbsolute(path)) return null;
    if (typeof expectedHash !== "string" || !/^[a-f0-9]{64}$/i.test(expectedHash)) return null;
    const root = await realpath(dirname(resolve(manifestPath)));
    const source = await realpath(resolve(root, path));
    const rel = relative(root, source);
    if (rel === ".." || rel.startsWith("../") || isAbsolute(rel)) return null;
    if (!(await stat(source)).isFile()) return null;
    const bytes = await readFile(source);
    const png = bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"));
    const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    const webm = bytes.subarray(0, 4).equals(Buffer.from("1a45dfa3", "hex"));
    if (!png && !jpeg && !webm) return null;
    const hash = createHash("sha256").update(bytes).digest("hex");
    return hash === expectedHash.toLowerCase() ? { bytes, hash } : null;
  } catch { return null; }
}

export async function gateEvidence(evidencePath, repo, options = {}) {
  const {
    requireFresh = true,
    requireMedia = true,
    maxNetworkFailures = 0,
    maxConsoleEvents = null
  } = options;

  const evidence = JSON.parse(await readFile(evidencePath, "utf8"));
  const steps = Array.isArray(evidence.steps) ? evidence.steps : [];
  const media = await Promise.all(steps.map(async (step) =>
    await verifiedMedia(step.screenshot, evidencePath, step.screenshotSha256) ||
    await verifiedMedia(step.video, evidencePath, step.videoSha256)));
  const networkFailures = (evidence.networkFailures ?? []).length;
  const consoleEvents = (evidence.console ?? []).length;
  const checks = [];

  checks.push(check(
    "run-status",
    "The recorded run must have passed its own assertions.",
    evidence.status === "PASSED" && steps.length > 0 && steps.every(s => s.status === "PASSED" && !s.error),
    `status=${evidence.status ?? "UNKNOWN"}`
  ));

  let freshness = null;
  if (requireFresh) {
    try { freshness = await verifyEvidence(evidencePath, repo); }
    catch { freshness = { status: "UNVERIFIABLE" }; }
    checks.push(check(
      "freshness",
      "Evidence must still match the current Git state of the repository.",
      freshness.status === "FRESH" && /^[a-f0-9]{64}$/i.test(evidence.fingerprint?.uncommittedDiffSha256 ?? "") && typeof evidence.fingerprint?.workingTreeStatus === "string",
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
    evidence.fingerprint?.workingTreeStatus === "" && (!requireFresh || freshness?.current?.workingTreeStatus === ""),
    "Clean capture/current state required: untracked file contents are not covered by the legacy fingerprint.",
    requireFresh ? "BLOCK" : "WARN"
  ));

  if (requireMedia) {
    checks.push(check(
      "runtime-media",
      "Every recorded step must have bundle-local media with matching SHA256 and a recognized media signature.",
      steps.length > 0 && media.every(Boolean),
      `${media.filter(Boolean).length}/${steps.length} steps have integrity-checked media`
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
      "The gate reads recorded evidence. It does not re-execute the journey.",
      "Media signatures and hashes check integrity, not capture authenticity or full media decodability.",
      "A local source SHA does not prove the identity of a remote deployed build."
    ]
  };
  await writeFile(join(dirname(resolve(evidencePath)), "gate.json"), json(report));
  return report;
}
