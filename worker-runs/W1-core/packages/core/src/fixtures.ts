/**
 * @proofrun/core — deterministic fixtures.
 *
 * Three end-to-end, fully deterministic scenarios that exercise the core
 * contracts. Every value is fixed (no clocks, no randomness, no I/O), so the
 * same input always yields the same validation + state outcome.
 *
 *  1. intent approval           — a clean run whose intent gate is approved.
 *  2. repeated failure breaker  — 3 consecutive step failures open the circuit.
 *  3. blast-radius approval     — a wider-blast-radius change is approved.
 */

import type {
  TaskSpec,
  RunFingerprint,
  RunEvent,
  Forecast,
  GateDecision,
  EvidenceManifest,
} from "./contracts.ts";

// Shared, fixed identity (deterministic on purpose).
export const FIXTURE_TS = "2026-09-14T09:00:00.000Z";
export const FIXTURE_RUN_ID = "run-2026-0914-health";

export const taskSpec: TaskSpec = {
  source: "TaskSpec",
  id: "tsk-add-health-route",
  task: "add-health-route",
  repository: "./fixture-next-app",
  permissions: {
    filesystem: "workspace-write",
    network: "deny",
    externalActions: "approval-required",
  },
  checks: ["pnpm test", "pnpm typecheck"],
  gates: {
    intent: "required",
    circuitBreakerAfterFailures: 3,
    blastRadius: "required",
  },
};

export const fingerprint: RunFingerprint = {
  source: "RunFingerprint",
  runId: FIXTURE_RUN_ID,
  model: "fixture-model-v1",
  provider: "fixture-provider",
  tools: ["read_file", "write_file", "bash"],
  repository: "./fixture-next-app",
  commit: "0000000000000000000000000000000000000000",
  startedAt: FIXTURE_TS,
};

// ---------------------------------------------------------------------------
// Scenario 1: intent approval (clean run)
// ---------------------------------------------------------------------------

/** The run's event log, ending in a successful completion. */
export const intentEvents: RunEvent[] = [
  { source: "RunEvent", runId: FIXTURE_RUN_ID, seq: 1, kind: "run_started", at: "2026-09-14T09:00:00.000Z", payload: {} },
  { source: "RunEvent", runId: FIXTURE_RUN_ID, seq: 2, kind: "gate_request", at: "2026-09-14T09:00:01.000Z", payload: { gate: "intent" } },
  { source: "RunEvent", runId: FIXTURE_RUN_ID, seq: 3, kind: "step_start", at: "2026-09-14T09:00:02.000Z", payload: { step: "add-route" } },
  { source: "RunEvent", runId: FIXTURE_RUN_ID, seq: 4, kind: "step_complete", at: "2026-09-14T09:00:03.000Z", payload: { step: "add-route" } },
  { source: "RunEvent", runId: FIXTURE_RUN_ID, seq: 5, kind: "run_completed", at: "2026-09-14T09:00:04.000Z", payload: { checks: ["passed", "passed"] } },
];

/** Forecast for the clean run: low exception probability, stays autonomous. */
export const intentForecast: Forecast = {
  source: "Forecast",
  runId: FIXTURE_RUN_ID,
  at: "2026-09-14T09:00:01.000Z",
  exceptionNextKSteps: 0.05,
  humanGateBeforeFinish: 0.1,
  basis: "rules",
  recommendedMode: "AUTO",
  kSteps: 5,
  etaToGateSeconds: 0,
};

/** Human approves the intent gate, citing the diff + test evidence. */
export const intentDecision: GateDecision = {
  source: "GateDecision",
  runId: FIXTURE_RUN_ID,
  gate: "intent",
  decision: "approve",
  reason: "Change is scoped to a new /health route; tests and typecheck pass.",
  evidenceRefs: ["ev-diff-1", "ev-test-1"],
  decidedAt: "2026-09-14T09:00:01.500Z",
};

/** Evidence package for the clean run (test + rollback references). */
export const intentManifest: EvidenceManifest = {
  source: "EvidenceManifest",
  runId: FIXTURE_RUN_ID,
  items: [
    { ref: "ev-diff-1", type: "diff", source: "diffs/health-route.diff", summary: "Adds app/health/route.ts and its test." },
    { ref: "ev-test-1", type: "test", source: "test/health.test.ts", summary: "pnpm test green for the health route." },
    { ref: "ev-rb-1", type: "rollback", source: "rollback/0001-revert-health.sh", summary: "Reverts the two added files." },
  ],
  rollbackRef: "ev-rb-1",
  testRefs: ["ev-test-1"],
};

// ---------------------------------------------------------------------------
// Scenario 2: repeated failure circuit breaker (3 consecutive failures)
// ---------------------------------------------------------------------------

/** The run hits 3 consecutive step failures, tripping the breaker. */
export const breakerEvents: RunEvent[] = [
  { source: "RunEvent", runId: FIXTURE_RUN_ID, seq: 1, kind: "run_started", at: "2026-09-14T09:10:00.000Z", payload: {} },
  { source: "RunEvent", runId: FIXTURE_RUN_ID, seq: 2, kind: "step_start", at: "2026-09-14T09:10:01.000Z", payload: { step: "run-migration" } },
  { source: "RunEvent", runId: FIXTURE_RUN_ID, seq: 3, kind: "step_failure", at: "2026-09-14T09:10:02.000Z", payload: { step: "run-migration", error: "ECONNREFUSED (retry 1)" } },
  { source: "RunEvent", runId: FIXTURE_RUN_ID, seq: 4, kind: "step_failure", at: "2026-09-14T09:10:03.000Z", payload: { step: "run-migration", error: "ECONNREFUSED (retry 2)" } },
  { source: "RunEvent", runId: FIXTURE_RUN_ID, seq: 5, kind: "step_failure", at: "2026-09-14T09:10:04.000Z", payload: { step: "run-migration", error: "ECONNREFUSED (retry 3)" } },
  { source: "RunEvent", runId: FIXTURE_RUN_ID, seq: 6, kind: "circuit_break_opened", at: "2026-09-14T09:10:05.000Z", payload: { threshold: 3, failures: 3 } },
];

/** Forecast after repeated failures: high exception probability, hard block. */
export const breakerForecast: Forecast = {
  source: "Forecast",
  runId: FIXTURE_RUN_ID,
  at: "2026-09-14T09:10:05.000Z",
  exceptionNextKSteps: 0.9,
  humanGateBeforeFinish: 0.95,
  basis: "empirical",
  recommendedMode: "HARD_BLOCK",
  kSteps: 5,
};

// ---------------------------------------------------------------------------
// Scenario 3: blast-radius approval (wider change, approved)
// ---------------------------------------------------------------------------

/** A larger change whose blast radius spans multiple routes and a shared lib. */
export const blastRadiusEvents: RunEvent[] = [
  { source: "RunEvent", runId: FIXTURE_RUN_ID, seq: 1, kind: "run_started", at: "2026-09-14T09:20:00.000Z", payload: {} },
  { source: "RunEvent", runId: FIXTURE_RUN_ID, seq: 2, kind: "gate_request", at: "2026-09-14T09:20:01.000Z", payload: { gate: "blast_radius" } },
  { source: "RunEvent", runId: FIXTURE_RUN_ID, seq: 3, kind: "step_start", at: "2026-09-14T09:20:02.000Z", payload: { step: "refactor-auth" } },
  { source: "RunEvent", runId: FIXTURE_RUN_ID, seq: 4, kind: "step_complete", at: "2026-09-14T09:20:03.000Z", payload: { step: "refactor-auth" } },
];

/** Blast-radius forecast: moderate probability, recommends pausing for review. */
export const blastRadiusForecast: Forecast = {
  source: "Forecast",
  runId: FIXTURE_RUN_ID,
  at: "2026-09-14T09:20:01.000Z",
  exceptionNextKSteps: 0.35,
  humanGateBeforeFinish: 0.5,
  basis: "calibrated",
  recommendedMode: "PAUSE",
  kSteps: 8,
  reviewTimeP50Seconds: 300,
  reviewTimeP90Seconds: 900,
};

/** Human approves the blast radius after reviewing the dependent-module map. */
export const blastRadiusDecision: GateDecision = {
  source: "GateDecision",
  runId: FIXTURE_RUN_ID,
  gate: "blast_radius",
  decision: "approve",
  reason: "Change touches 2 routes + 1 shared lib; dependency map reviewed, rollback present.",
  evidenceRefs: ["ev-diff-2", "ev-surface-1", "ev-rb-2"],
  decidedAt: "2026-09-14T09:20:02.000Z",
};

/** Evidence package for the blast-radius run. */
export const blastRadiusManifest: EvidenceManifest = {
  source: "EvidenceManifest",
  runId: FIXTURE_RUN_ID,
  items: [
    { ref: "ev-diff-2", type: "diff", source: "diffs/auth-refactor.diff", summary: "Refactors auth middleware used by 2 routes." },
    { ref: "ev-surface-1", type: "diff", source: "surface/auth-deps.json", summary: "Source-linked change surface of dependent modules." },
    { ref: "ev-test-2", type: "test", source: "test/auth.test.ts", summary: "pnpm test green for auth paths." },
    { ref: "ev-rb-2", type: "rollback", source: "rollback/0002-revert-auth.sh", summary: "Reverts the middleware refactor." },
  ],
  rollbackRef: "ev-rb-2",
  testRefs: ["ev-test-2"],
};

/** Convenient bundle for tests / downstream slices. */
export const fixtures = {
  taskSpec,
  fingerprint,
  intent: { events: intentEvents, forecast: intentForecast, decision: intentDecision, manifest: intentManifest },
  breaker: { events: breakerEvents, forecast: breakerForecast },
  blastRadius: { events: blastRadiusEvents, forecast: blastRadiusForecast, decision: blastRadiusDecision, manifest: blastRadiusManifest },
} as const;
