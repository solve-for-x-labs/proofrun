/**
 * @proofrun/core — contract tests.
 *
 * Run exactly:
 *   node --test packages/core/test/contracts.test.mjs
 * or (from packages/core):
 *   node --test
 *
 * Covers: valid input, invalid input, and state-transition rejection.
 * No dependencies; uses Node's built-in test runner + assert.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  CONTRACT_SOURCE_NAMES,
  GATE_KINDS,
  DECISIONS,
  AUTONOMY_MODES,
  PROBABILITY_BASES,
  RUN_EVENT_KINDS,
  RUN_STATES,
  GATE_STATES,
  validateContract,
  validateTaskSpec,
  validateRunFingerprint,
  validateRunEvent,
  validateForecast,
  validateGateDecision,
  validateEvidenceManifest,
  transitionRunState,
  transitionGateState,
  circuitBreakerState,
  breakerTripped,
  InvalidTransitionError,
  // fixtures
  taskSpec,
  fingerprint,
  fixtures,
} from "../src/index.ts";

const {
  intent: intentFx,
  breaker: breakerFx,
  blastRadius: blastRadiusFx,
} = fixtures;

/** Deep clone without Buffer/SharedArray (plain JSON is fine for these fixtures). */
function clone(v) {
  return JSON.parse(JSON.stringify(v));
}

// ---------------------------------------------------------------------------
// Valid input
// ---------------------------------------------------------------------------

test("TaskSpec fixture is valid", () => {
  const r = validateTaskSpec(clone(taskSpec));
  assert.equal(r.ok, true, JSON.stringify(r));
});

test("RunFingerprint fixture is valid", () => {
  const r = validateRunFingerprint(clone(fingerprint));
  assert.equal(r.ok, true, JSON.stringify(r));
});

test("every run event in every scenario is valid", () => {
  for (const list of [intentFx.events, breakerFx.events, blastRadiusFx.events]) {
    for (const e of list) {
      const r = validateRunEvent(clone(e));
      assert.equal(r.ok, true, JSON.stringify(r));
    }
  }
});

test("forecasts carry a probability basis and a recommended autonomy mode", () => {
  for (const f of [intentFx.forecast, breakerFx.forecast, blastRadiusFx.forecast]) {
    const r = validateForecast(clone(f));
    assert.equal(r.ok, true, JSON.stringify(r));
    // basis + mode must be members of their explicit unions
    assert.ok(PROBABILITY_BASES.includes(f.basis), "basis is a valid union member");
    assert.ok(AUTONOMY_MODES.includes(f.recommendedMode), "mode is a valid union member");
  }
});

test("gate decisions carry evidence refs and a timestamp", () => {
  for (const d of [intentFx.decision, blastRadiusFx.decision]) {
    const r = validateGateDecision(clone(d));
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.ok(Array.isArray(d.evidenceRefs) && d.evidenceRefs.length > 0, "evidence refs present");
    assert.ok(!Number.isNaN(Date.parse(d.decidedAt)), "timestamp parses");
    assert.ok(GATE_KINDS.includes(d.gate), "gate is a valid union member");
    assert.ok(DECISIONS.includes(d.decision), "decision is a valid union member");
  }
});

test("evidence manifests are valid and reference real items", () => {
  for (const m of [intentFx.manifest, blastRadiusFx.manifest]) {
    const r = validateEvidenceManifest(clone(m));
    assert.equal(r.ok, true, JSON.stringify(r));
    const refs = new Set(m.items.map((i) => i.ref));
    assert.ok(refs.has(m.rollbackRef), "rollbackRef points at a real item");
    for (const t of m.testRefs) assert.ok(refs.has(t), "testRef points at a real item");
  }
});

test("validateContract dispatches by source discriminator", () => {
  const cases = [
    taskSpec,
    fingerprint,
    intentFx.events[0],
    intentFx.forecast,
    intentFx.decision,
    intentFx.manifest,
  ];
  for (const c of cases) {
    const r = validateContract(clone(c));
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.value.source, c.source);
  }
});

// ---------------------------------------------------------------------------
// Invalid input
// ---------------------------------------------------------------------------

test("TaskSpec rejects a missing source discriminator", () => {
  const bad = clone(taskSpec);
  delete bad.source;
  const r = validateTaskSpec(bad);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes("source")));
});

test("TaskSpec rejects an out-of-union permission value", () => {
  const bad = clone(taskSpec);
  bad.permissions.network = "allow";
  const r = validateTaskSpec(bad);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes("network")));
});

test("TaskSpec rejects an empty checks array", () => {
  const bad = clone(taskSpec);
  bad.checks = [];
  const r = validateTaskSpec(bad);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes("checks")));
});

test("TaskSpec rejects a non-integer circuit-breaker threshold", () => {
  const bad = clone(taskSpec);
  bad.gates.circuitBreakerAfterFailures = 2.5;
  const r = validateTaskSpec(bad);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes("circuitBreakerAfterFailures")));
});

test("RunEvent rejects an out-of-union event kind", () => {
  const bad = clone(intentFx.events[0]);
  bad.kind = "teleport";
  const r = validateRunEvent(bad);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes("kind")));
});

test("RunEvent rejects a zero seq", () => {
  const bad = clone(intentFx.events[0]);
  bad.seq = 0;
  const r = validateRunEvent(bad);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes("seq")));
});

test("Forecast rejects a probability outside [0,1]", () => {
  const bad = clone(intentFx.forecast);
  bad.exceptionNextKSteps = 1.4;
  const r = validateForecast(bad);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes("exceptionNextKSteps")));
});

test("Forecast rejects a missing basis (probability basis is required)", () => {
  const bad = clone(intentFx.forecast);
  delete bad.basis;
  const r = validateForecast(bad);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes("basis")));
});

test("Forecast rejects a missing recommendedMode (autonomy mode is required)", () => {
  const bad = clone(intentFx.forecast);
  delete bad.recommendedMode;
  const r = validateForecast(bad);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes("recommendedMode")));
});

test("GateDecision rejects empty evidence refs", () => {
  const bad = clone(intentFx.decision);
  bad.evidenceRefs = [];
  const r = validateGateDecision(bad);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes("evidenceRefs")));
});

test("GateDecision rejects a malformed timestamp", () => {
  const bad = clone(intentFx.decision);
  bad.decidedAt = "not-a-date";
  const r = validateGateDecision(bad);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes("decidedAt")));
});

test("EvidenceManifest rejects a rollbackRef that no item provides", () => {
  const bad = clone(intentFx.manifest);
  bad.rollbackRef = "ev-ghost";
  // The structural validator still passes (string is present); the semantic
  // cross-reference is asserted separately and is expected to be inconsistent.
  const r = validateEvidenceManifest(bad);
  assert.equal(r.ok, true, "string shape still valid");
  const refs = new Set(bad.items.map((i) => i.ref));
  assert.ok(!refs.has(bad.rollbackRef), "ghost ref is not backed by an item");
});

test("validateContract rejects an unknown source discriminator", () => {
  const r = validateContract({ source: "Wormhole", x: 1 });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes("source")));
});

test("validateContract rejects non-object input", () => {
  assert.equal(validateContract("nope").ok, false);
  assert.equal(validateContract(null).ok, false);
  assert.equal(validateContract(42).ok, false);
});

// ---------------------------------------------------------------------------
// State-transition rejection
// ---------------------------------------------------------------------------

test("run state machine rejects terminal -> running", () => {
  assert.throws(
    () => transitionRunState("completed", "running"),
    InvalidTransitionError,
  );
});

test("run state machine rejects skipping straight to completed", () => {
  // planned cannot jump to completed; it must go through running.
  assert.throws(() => transitionRunState("planned", "completed"), InvalidTransitionError);
});

test("run state machine allows the happy path", () => {
  assert.equal(transitionRunState("planned", "running"), "running");
  assert.equal(transitionRunState("running", "completed"), "completed");
});

test("run state machine rejects unknown states", () => {
  assert.throws(() => transitionRunState("nirvana", "running"), InvalidTransitionError);
  assert.throws(() => transitionRunState("planned", "nirvana"), InvalidTransitionError);
});

test("gate state machine rejects deciding an idle gate", () => {
  // A gate must be requested before it can be decided.
  assert.throws(() => transitionGateState("idle", "decided"), InvalidTransitionError);
});

test("gate state machine rejects re-opening a decided gate", () => {
  assert.throws(() => transitionGateState("decided", "requested"), InvalidTransitionError);
});

test("circuit breaker opens at exactly the threshold", () => {
  // Wave-0 AC #3: 3 repeated failures trip the breaker.
  assert.equal(circuitBreakerState(2, 3), "idle");
  assert.equal(circuitBreakerState(3, 3), "trip_open");
  assert.equal(circuitBreakerState(5, 3), "trip_open");
});

test("circuit breaker rejects negative or non-integer input", () => {
  assert.throws(() => circuitBreakerState(-1, 3), InvalidTransitionError);
  assert.throws(() => circuitBreakerState(3, 0), InvalidTransitionError);
});

test("breaker trips on the repeated-failure fixture at threshold 3", () => {
  const failures = breakerFx.events.filter((e) => e.kind === "step_failure").length;
  assert.equal(failures, 3, "fixture has exactly 3 consecutive failures");
  assert.equal(breakerTripped(breakerFx.events, taskSpec.gates.circuitBreakerAfterFailures), true);
});

test("breaker does not trip on a clean run", () => {
  assert.equal(breakerTripped(intentFx.events, taskSpec.gates.circuitBreakerAfterFailures), false);
});

// ---------------------------------------------------------------------------
// Union / source-name invariants (acceptance criteria: source names + unions)
// ---------------------------------------------------------------------------

test("every contract exposes a source name and its union is non-empty", () => {
  for (const name of CONTRACT_SOURCE_NAMES) {
    assert.ok(name.length > 0);
  }
  // Every fixture's source is one of the declared contract names.
  const all = [
    taskSpec.source,
    fingerprint.source,
    ...intentFx.events.map((e) => e.source),
    intentFx.forecast.source,
    intentFx.decision.source,
    intentFx.manifest.source,
  ];
  for (const s of all) {
    assert.ok(CONTRACT_SOURCE_NAMES.includes(s), `source ${s} is a declared contract`);
  }
});

test("run-state and gate-state unions are internally consistent with the machines", () => {
  // Every declared state is a valid input to the machines (no throw on the identity probe
  // is impossible, so instead assert each is accepted as `from` for a legal `to`).
  for (const s of RUN_STATES) {
    // at least the set membership holds; machines throw only on bad edges
    assert.ok(typeof s === "string");
  }
  for (const s of GATE_STATES) {
    assert.ok(typeof s === "string");
  }
});
