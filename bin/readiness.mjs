import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

export const CAPTURE_STATES = Object.freeze(["LIVE_VERIFIED", "LIVE_BLANK", "RENDER_TIMEOUT", "CAPTURE_FAILED", "NO_RUNTIME_MEDIA", "REVIEW_REQUIRED"]);

export function assessStep(step) {
  if (step?.capture === "verified-real") return { state: "LIVE_VERIFIED", approval: "REVIEW" };
  if (step?.capture === "blank-capture") return { state: "LIVE_BLANK", approval: "BLOCK" };
  if (step?.capture === "render-timeout") return { state: "RENDER_TIMEOUT", approval: "BLOCK" };
  if (step?.capture === "capture-failed") return { state: "CAPTURE_FAILED", approval: "BLOCK" };
  if (!step?.screenshot && !step?.video) return { state: "NO_RUNTIME_MEDIA", approval: "BLOCK" };
  return { state: "REVIEW_REQUIRED", approval: "REVIEW" };
}

export function assessEvidence(evidence) {
  const steps = Array.isArray(evidence?.steps) ? evidence.steps : [];
  const assessed = steps.map((step) => ({ id: step.id ?? null, title: step.title ?? step.id ?? "untitled", ...assessStep(step) }));
  const counts = Object.fromEntries(CAPTURE_STATES.map((state) => [state, 0]));
  for (const step of assessed) counts[step.state] += 1;
  const approval = assessed.length > 0 && assessed.every((step) => step.state === "LIVE_VERIFIED") ? "APPROVABLE" : "REVIEW_REQUIRED";
  return { schemaVersion: "0.1", kind: "proofrun-evidence-readiness", approval, totalSteps: assessed.length, counts, steps: assessed };
}

export async function assessEvidenceFile(inputPath, outDir = dirname(resolve(inputPath))) {
  const report = assessEvidence(JSON.parse(await readFile(inputPath, "utf8")));
  await mkdir(resolve(outDir), { recursive: true });
  await writeFile(join(resolve(outDir), "readiness.json"), JSON.stringify(report, null, 2) + "\n");
  return report;
}
