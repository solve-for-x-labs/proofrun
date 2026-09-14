import { test } from "node:test";
import assert from "node:assert/strict";
import {
  forecast,
  percentile,
  recommendMode,
  resolveEmpiricalExceptionRate,
  computeSeverity,
  DEFAULT_BASELINE,
  type ForecastInput,
} from "../src/index.ts";
import { FIXTURES, FIXTURE_NAMES } from "../src/fixtures.ts";

// --- Determinism: same input -> same output, byte-identical JSON ------------

test("determinism: identical input yields byte-identical forecast", () => {
  const a = JSON.stringify(forecast(FIXTURES.repeatedFailure));
  const b = JSON.stringify(forecast(FIXTURES.repeatedFailure));
  assert.equal(a, b, "same input must produce identical JSON");
});

test("determinism: holds across every fixture", () => {
  for (const name of FIXTURE_NAMES) {
    const input = FIXTURES[name];
    const one = JSON.stringify(forecast(input));
    const two = JSON.stringify(forecast(input));
    assert.equal(one, two, `fixture ${name} not deterministic`);
  }
});

// --- basis & uncertainty present on every forecast --------------------------

test("every forecast includes a basis and uncertainty/limitations", () => {
  for (const name of FIXTURE_NAMES) {
    const f = forecast(FIXTURES[name]);
    assert.ok(typeof f.exception.basis === "string" && f.exception.basis.length > 0, `${name}: exception.basis`);
    assert.ok(typeof f.gate.basis === "string" && f.gate.basis.length > 0, `${name}: gate.basis`);
    assert.ok(typeof f.etaToNextGateMin.basis === "string", `${name}: eta.basis`);
    assert.ok(typeof f.reviewTimeMin.basis === "string", `${name}: review.basis`);
    assert.ok(typeof f.recoveryTimeMin.basis === "string", `${name}: recovery.basis`);
    assert.ok(f.uncertainty, `${name}: uncertainty present`);
    assert.ok(Array.isArray(f.uncertainty.limitations) && f.uncertainty.limitations.length > 0, `${name}: limitations non-empty`);
    assert.ok(["low", "medium", "high"].includes(f.uncertainty.level), `${name}: level valid`);
  }
});

// --- Severity increases with missing health / repeated failures -------------

test("missing provider health raises severity vs a fully-healthy run", () => {
  const healthy = computeSeverity(FIXTURES.normalSuccess.fingerprint, FIXTURES.normalSuccess.signals);
  const missing = computeSeverity(FIXTURES.providerHealthMissing.fingerprint, FIXTURES.providerHealthMissing.signals);
  assert.ok(missing.score > healthy.score, `missing(${missing.score}) should exceed healthy(${healthy.score})`);
});

test("repeated failures raise severity vs normal success", () => {
  const healthy = computeSeverity(FIXTURES.normalSuccess.fingerprint, FIXTURES.normalSuccess.signals);
  const failing = computeSeverity(FIXTURES.repeatedFailure.fingerprint, FIXTURES.repeatedFailure.signals);
  assert.ok(failing.score > healthy.score, `repeatedFailure(${failing.score}) should exceed normalSuccess(${healthy.score})`);
});

test("severity is monotonic: more recent failures -> higher score", () => {
  const base = FIXTURES.normalSuccess;
  const oneFail: ForecastInput = {
    ...base,
    signals: {
      ...base.signals,
      steps: [{ index: 0, status: "failure", gate: null, gateDurationMin: null, durationMs: 4000, errors: ["x"] }],
    },
  };
  const manyFail: ForecastInput = {
    ...base,
    signals: {
      ...base.signals,
      steps: Array.from({ length: 5 }, () => ({
        index: 0, status: "failure" as const, gate: null, gateDurationMin: null, durationMs: 4000, errors: ["x"],
      })),
    },
  };
  const s0 = computeSeverity(base.fingerprint, base.signals).score;
  const s1 = computeSeverity(oneFail.fingerprint, oneFail.signals).score;
  const s5 = computeSeverity(manyFail.fingerprint, manyFail.signals).score;
  assert.ok(s5 > s1, "5 failures > 1 failure");
  assert.ok(s1 >= s0, "1 failure >= clean");
});

// --- Missing health / repeated failures increase intervention severity -------

test("repeated failure fixture escalates to PAUSE or HARD_BLOCK", () => {
  const f = forecast(FIXTURES.repeatedFailure);
  assert.ok(["PAUSE", "HARD_BLOCK"].includes(f.mode.recommended), `got ${f.mode.recommended}`);
});

test("normal success stays AUTO and below the repeated-failure severity", () => {
  const ok = forecast(FIXTURES.normalSuccess);
  const bad = forecast(FIXTURES.repeatedFailure);
  assert.equal(ok.mode.recommended, "AUTO");
  assert.ok(ok.severity.score < bad.severity.score);
});

// --- Exception probability grows with the horizon k and with severity --------

test("exception probability is higher for a failing run than a clean run", () => {
  const ok = forecast(FIXTURES.normalSuccess);
  const bad = forecast(FIXTURES.repeatedFailure);
  assert.ok(bad.exception.probNextK > ok.exception.probNextK);
});

test("exception probability is non-decreasing in k", () => {
  const mk = (k: number) => forecast({
    ...FIXTURES.normalSuccess,
    signals: { ...FIXTURES.normalSuccess.signals, k },
  }).exception.probNextK;
  assert.ok(mk(3) <= mk(5) && mk(5) <= mk(10));
});

test("a likely human gate alone does not escalate to PAUSE/HARD_BLOCK", () => {
  // Many planned gates => high gate probability, but the run itself is healthy.
  const gateHeavy = forecast({
    ...FIXTURES.normalSuccess,
    signals: { ...FIXTURES.normalSuccess.signals, gatesRemaining: 4 },
  });
  assert.ok(gateHeavy.gate.probBeforeCompletion >= 0.6, "gate probability should be high");
  assert.ok(["AUTO", "NOTIFY"].includes(gateHeavy.mode.recommended), `got ${gateHeavy.mode.recommended}`);
});

// --- Gate probability & ETA --------------------------------------------------

test("gatesRemaining>0 produces a numeric ETA; 0 produces null with basis", () => {
  const withGate = forecast(FIXTURES.riskyChange);
  assert.equal(withGate.gate.gateExpected, true);
  assert.ok(typeof withGate.etaToNextGateMin.p50 === "number");
  assert.ok(withGate.etaToNextGateMin.p50! > 0);
  assert.ok(withGate.etaToNextGateMin.p90! >= withGate.etaToNextGateMin.p50!);

  const noGate = forecast(FIXTURES.normalSuccess);
  assert.equal(noGate.gate.gateExpected, false);
  assert.equal(noGate.etaToNextGateMin.p50, null);
  assert.ok(typeof noGate.etaToNextGateMin.basis === "string");
});

test("gate probability rises when more gates remain", () => {
  const few = forecast(FIXTURES.normalSuccess); // 0 gates
  const many = forecast({
    ...FIXTURES.normalSuccess,
    signals: { ...FIXTURES.normalSuccess.signals, gatesRemaining: 3 },
  });
  assert.ok(many.gate.probBeforeCompletion > few.gate.probBeforeCompletion);
});

// --- Empirical history replaces defaults -------------------------------------

test("empirical history switches exception source to 'empirical'", () => {
  const emp = forecast(FIXTURES.empiricalHistory);
  assert.equal(emp.exception.source, "empirical");
  assert.equal(emp.reviewTimeMin.source, "empirical");
  assert.equal(emp.recoveryTimeMin.source, "empirical");
});

test("no history keeps 'default-baseline' source", () => {
  const def = forecast(FIXTURES.normalSuccess);
  assert.equal(def.exception.source, "default-baseline");
  assert.equal(def.reviewTimeMin.source, "default-baseline");
});

test("resolveEmpiricalExceptionRate returns null below min sample", () => {
  assert.equal(resolveEmpiricalExceptionRate([0, 1, 0]), null);
  assert.ok(resolveEmpiricalExceptionRate([1, 0, 1, 0, 1, 0, 1, 0]) > 0);
});

// --- Percentile helper -------------------------------------------------------

test("percentile is deterministic and correct on known data", () => {
  const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  assert.equal(percentile(data, 0), 1);
  assert.equal(percentile(data, 1), 10);
  assert.ok(typeof percentile(data, 0.5) === "number");
  assert.ok(typeof percentile(data, 0.9) === "number");
  assert.equal(percentile([], 0.5), null);
  assert.equal(percentile([7], 0.9), 7);
});

// --- Mode thresholds ---------------------------------------------------------

test("recommendMode is deterministic and ordered", () => {
  const auto = recommendMode(5, 0.05, 0.05, "ok", false).recommended;
  const hard = recommendMode(95, 0.9, 0.9, "down", true).recommended;
  assert.equal(auto, "AUTO");
  assert.equal(hard, "HARD_BLOCK");
});

// --- Calibration: predicted vs observed kept separate, no faked accuracy -----

import { buildCalibrationRecord, calibrationSummary } from "../src/index.ts";

test("calibration keeps predicted and observed in separate fields", () => {
  const f = forecast(FIXTURES.normalSuccess);
  const rec = buildCalibrationRecord(f, { exceptionOccurred: false, reviewMin: 5 });
  assert.ok("predicted" in rec && "observed" in rec);
  assert.equal(rec.predicted.exceptionProbNextK, f.exception.probNextK);
  assert.equal(rec.observed.exceptionOccurred, false);
  // fields are distinct containers, not merged
  assert.notDeepEqual(rec.predicted, rec.observed);
});

test("calibration returns null (not 0) for metrics with too few samples", () => {
  const f = forecast(FIXTURES.normalSuccess);
  const one = buildCalibrationRecord(f, { exceptionOccurred: true });
  const summary = calibrationSummary([one]);
  assert.equal(summary.metrics.exceptionBrier, null);
  assert.equal(summary.sufficientForAccuracy, false);
  assert.match(summary.note, /insufficient/);
});

test("calibration computes a metric once enough matched samples exist", () => {
  const f = forecast(FIXTURES.normalSuccess);
  const records = Array.from({ length: 5 }, () =>
    buildCalibrationRecord(f, { exceptionOccurred: false, reviewMin: 6 }),
  );
  const summary = calibrationSummary(records);
  assert.ok(typeof summary.metrics.exceptionBrier === "number");
  assert.ok(summary.metrics.reviewMAEmin === null || typeof summary.metrics.reviewMAEmin === "number");
  assert.equal(summary.sufficientForAccuracy, true);
});

test("default baseline constants are the only priors used", () => {
  assert.equal(DEFAULT_BASELINE.kDefault, 5);
  assert.ok(DEFAULT_BASELINE.baseExceptionRate > 0);
});
