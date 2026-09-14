/**
 * @proofrun/forecast — Rules-first Intervention Forecast baseline.
 *
 * Design constraints (enforced by construction, not by policy):
 *   - Deterministic: identical input -> identical output (no randomness, no clock,
 *     no network, no model self-confidence, no external API).
 *   - Transparent: every output carries a `basis` string explaining which rule
 *     path produced it, and an `uncertainty` block stating limitations.
 *   - Empirical-first where data exists: real run history replaces defaults via
 *     small, isolated "empirical resolver" functions. With no history those
 *     resolvers return `null` and the default baseline is used. This lets later
 *     real run history slot in without touching the scoring rules.
 *   - Honest calibration: predicted and observed values are stored separately
 *     and accuracy metrics are only computed from matched predicted+observed
 *     pairs (never asserted from predictions alone).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type GateKind = "approval" | "confirmation" | "decision" | "escalation";
export type ProviderHealth = "ok" | "degraded" | "down" | "unknown";
export type ToolHealth = "ok" | "degraded" | "down" | "unknown";
export type RunStatus = "running" | "success" | "failure" | "aborted";
export type RepoTrust = "trusted" | "untrusted" | "unknown";
export type RecommendedMode = "AUTO" | "NOTIFY" | "PAUSE" | "HARD_BLOCK";
export type PercentileSource = "empirical" | "default-baseline";

export interface Fingerprint {
  model: string;
  provider: string;
  providerHealth: ProviderHealth;
  tool: string;
  toolHealth: ToolHealth;
  repository: string;
  repoTrust: RepoTrust;
}

export interface StepSignal {
  index: number;
  status: RunStatus;
  /** Present when this step triggered or completed a human gate. */
  gate: GateKind | null;
  /** Observed human interaction duration for this step (minutes), if a gate. */
  gateDurationMin: number | null;
  /** Wall time the step took (ms). Informational; not used for scoring. */
  durationMs: number;
  /** Human-readable error tags for this step. */
  errors: string[];
}

export interface RunSignals {
  steps: StepSignal[];
  /** Forward horizon in steps (default k used when omitted in callers). */
  k: number;
  /** Historical throughput (steps per hour). */
  stepsPerHour: number;
  /** How many steps are expected between now and completion. */
  expectedRemainingSteps: number;
  /** Number of human gates the plan still expects before completion. */
  gatesRemaining: number;
  /** 0..1 completion progress. */
  completionProgress: number;
  /** Real run history, when available. Empty arrays => defaults used. */
  observed: {
    reviewDurationsMin: number[];
    recoveryDurationsMin: number[];
    /** Per-step exception flag (1 = exception, 0 = clean). */
    exceptionCounts: number[];
  };
}

export interface ForecastInput {
  fingerprint: Fingerprint;
  signals: RunSignals;
}

export interface SeverityBreakdown {
  score: number; // 0..100
  contributors: Record<string, number>;
}

export interface PercentileOut {
  p50: number;
  p90: number;
  source: PercentileSource;
  basis: string;
}

export interface Forecast {
  /** Echo of the inputs (sanitized) so the forecast is self-contained. */
  input: {
    fingerprint: Fingerprint;
    k: number;
    expectedRemainingSteps: number;
    stepsPerHour: number;
    completionProgress: number;
    gatesRemaining: number;
  };
  severity: SeverityBreakdown;
  exception: {
    k: number;
    perStepRate: number;
    probNextK: number;
    source: PercentileSource;
    basis: string;
  };
  gate: {
    probBeforeCompletion: number;
    gateExpected: boolean;
    basis: string;
  };
  etaToNextGateMin: {
    p50: number | null;
    p90: number | null;
    gateExpected: boolean;
    basis: string;
  };
  reviewTimeMin: PercentileOut;
  recoveryTimeMin: PercentileOut;
  mode: {
    recommended: RecommendedMode;
    reasons: string[];
  };
  /** Always present. Describes data quality and honesty of the forecast. */
  uncertainty: {
    level: "low" | "medium" | "high";
    sampleSizes: {
      exception: number;
      review: number;
      recovery: number;
    };
    limitations: string[];
  };
}

// ---------------------------------------------------------------------------
// Default empirical baselines.
// These are placeholders chosen to be plausible, NOT measured. They are the
// only "priors" in the system and are clearly labeled as defaults everywhere.
// Real run history replaces them through the resolver functions below.
// ---------------------------------------------------------------------------

export const DEFAULT_BASELINE = {
  /** Per-step exception probability for a healthy run. */
  baseExceptionRate: 0.03,
  /** Per-step human-gate rate for a normal run. */
  baseGateRate: 0.02,
  /** Human review time (minutes). */
  baseReviewMin: { p50: 5, p90: 20 },
  /** Recovery time after a failure (minutes). */
  baseRecoveryMin: { p50: 10, p90: 45 },
  stepsPerHourDefault: 12,
  kDefault: 5,
} as const;

/** Minimum samples needed before empirical values replace a default. */
export const MIN_SAMPLE = {
  exceptionRate: 8,
  review: 3,
  recovery: 3,
} as const;

// ---------------------------------------------------------------------------
// Deterministic helpers
// ---------------------------------------------------------------------------

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
const round = (x: number, dp: number): number => {
  const f = 10 ** dp;
  return Math.round((x + Number.EPSILON) * f) / f;
};

/** "Type 7" linear-interpolation percentile. Pure & deterministic. */
export function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  if (sorted.length === 1) return sorted[0];
  const asc = [...sorted].sort((a, b) => a - b);
  const idx = (asc.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return asc[lo];
  return asc[lo] + (asc[hi] - asc[lo]) * (idx - lo);
}

/**
 * Empirical resolver for per-step exception rate.
 * Returns the observed rate only when enough history exists; otherwise `null`
 * so the caller falls back to the (severity-scaled) default. This is the seam
 * where real run history replaces the default.
 */
export function resolveEmpiricalExceptionRate(
  exceptionCounts: number[],
): number | null {
  if (exceptionCounts.length < MIN_SAMPLE.exceptionRate) return null;
  const sum = exceptionCounts.reduce((a, b) => a + b, 0);
  return clamp01(sum / exceptionCounts.length);
}

// ---------------------------------------------------------------------------
// Severity (0..100). Monotonic in every risk signal.
// ---------------------------------------------------------------------------

const PROVIDER_PENALTY: Record<ProviderHealth, number> = {
  ok: 0, degraded: 12, down: 45, unknown: 15,
};
const TOOL_PENALTY: Record<ToolHealth, number> = {
  ok: 0, degraded: 8, down: 30, unknown: 10,
};
const REPO_PENALTY: Record<RepoTrust, number> = {
  trusted: 0, untrusted: 10, unknown: 5,
};

const RECENT_WINDOW = 5;

export function computeSeverity(fp: Fingerprint, sig: RunSignals): SeverityBreakdown {
  const contributors: Record<string, number> = {};
  const recent = sig.steps.slice(-RECENT_WINDOW);
  const recentFailures = recent.filter((s) => s.status === "failure").length;
  const last = sig.steps[sig.steps.length - 1];

  contributors.providerHealth = PROVIDER_PENALTY[fp.providerHealth];
  contributors.toolHealth = TOOL_PENALTY[fp.toolHealth];
  contributors.repoTrust = REPO_PENALTY[fp.repoTrust];
  // Repeated failures: each failure in the recent window adds, capped.
  contributors.recentFailures = Math.min(recentFailures, 5) * 10;
  contributors.recentGate = recent.some((s) => s.gate !== null) ? 5 : 0;
  contributors.recentErrors = last ? Math.min(last.errors.length, 5) * 3 : 0;

  const raw = Object.values(contributors).reduce((a, b) => a + b, 0);
  const score = Math.min(100, Math.round(raw));
  return { score, contributors };
}

// ---------------------------------------------------------------------------
// Percentile resolution for review/recovery.
// ---------------------------------------------------------------------------

function resolvePercentiles(
  name: string,
  observed: number[],
  def: { p50: number; p90: number },
  severityMultiplier: number,
): PercentileOut {
  const p50Emp = observed.length >= 3 ? percentile(observed, 0.5) : null;
  const p90Emp = observed.length >= 3 ? percentile(observed, 0.9) : null;

  if (p50Emp !== null && p90Emp !== null) {
    return {
      p50: round(p50Emp * severityMultiplier, 1),
      p90: round(p90Emp * severityMultiplier, 1),
      source: "empirical",
      basis: `${name}: empirical percentiles from ${observed.length} observed values, scaled by current severity`,
    };
  }
  return {
    p50: round(def.p50 * severityMultiplier, 1),
    p90: round(def.p90 * severityMultiplier, 1),
    source: "default-baseline",
    basis: `${name}: default baseline (no empirical sample >= 3), scaled by current severity`,
  };
}

// ---------------------------------------------------------------------------
// Mode recommendation. Deterministic thresholds on transparent signals.
// ---------------------------------------------------------------------------

/**
 * Mode recommendation.
 *
 * Semantics (transparent and ordered):
 *   - A *human gate* being likely is an intervention **point** (a safety net),
 *     not a danger by itself. It only drives NOTIFY so the human is ready.
 *   - The *danger* signals — exception probability, aggregate severity, provider
 *     down, repeated failures — drive PAUSE and HARD_BLOCK.
 */
export function recommendMode(
  severity: number,
  pExceptionK: number,
  pGate: number,
  providerHealth: ProviderHealth,
  repeatedFailures: boolean,
): { recommended: RecommendedMode; reasons: string[] } {
  const providerDown = providerHealth === "down";
  const reasons: string[] = [];
  if (providerDown) reasons.push("provider health = down");
  if (repeatedFailures) reasons.push("repeated failures in recent window");

  const hard =
    providerDown ||
    pExceptionK >= 0.7 ||
    severity >= 75 ||
    (repeatedFailures && severity >= 60);
  const pause =
    pExceptionK >= 0.45 ||
    severity >= 55 ||
    (repeatedFailures && severity >= 40);
  // A likely gate is a reason to notify (human will be in the loop), never to block.
  const notify =
    pExceptionK >= 0.2 ||
    severity >= 30 ||
    pGate >= 0.6 ||
    providerHealth === "unknown";

  if (hard) return { recommended: "HARD_BLOCK", reasons: [...reasons, "danger signals beyond block thresholds"] };
  if (pause) return { recommended: "PAUSE", reasons: [...reasons, "danger signals beyond pause thresholds"] };
  if (notify) return { recommended: "NOTIFY", reasons: [...reasons, "intervention point likely or elevated risk"] };
  return { recommended: "AUTO", reasons: ["below intervention thresholds"] };
}

// ---------------------------------------------------------------------------
// Main forecast.
// ---------------------------------------------------------------------------

export function forecast(input: ForecastInput): Forecast {
  const { fingerprint: fp, signals: sig } = input;
  const k = sig.k > 0 ? sig.k : DEFAULT_BASELINE.kDefault;
  const stepsPerHour = sig.stepsPerHour > 0 ? sig.stepsPerHour : DEFAULT_BASELINE.stepsPerHourDefault;

  const severity = computeSeverity(fp, sig);
  const sevFactor = 1 + severity.score / 100; // 0..2 linear, monotonic
  const sevMult = 1 + severity.score / 200; // 0..1.5 gentler multiplier for times

  const recent = sig.steps.slice(-RECENT_WINDOW);
  const recentFailures = recent.filter((s) => s.status === "failure").length;
  const repeatedFailures = recentFailures >= 3;

  // --- Exception probability over next k steps ---------------------------
  const empiricalRate = resolveEmpiricalExceptionRate(sig.observed.exceptionCounts);
  let perStepRate: number;
  let excSource: PercentileSource;
  let excBasis: string;
  if (empiricalRate !== null) {
    perStepRate = empiricalRate;
    excSource = "empirical";
    excBasis = `per-step rate from ${sig.observed.exceptionCounts.length} observed steps (run history), horizon k=${k}`;
  } else {
    perStepRate = clamp01(DEFAULT_BASELINE.baseExceptionRate * sevFactor);
    excSource = "default-baseline";
    excBasis = `default base rate ${DEFAULT_BASELINE.baseExceptionRate} scaled by severity factor ${round(sevFactor, 3)} (no empirical sample >= ${MIN_SAMPLE.exceptionRate}), horizon k=${k}`;
  }
  const probNextK = clamp01(1 - (1 - perStepRate) ** k);

  // --- Probability of a human gate before completion ---------------------
  // Union of two independent mechanisms: (a) per-step stochastic gate,
  // (b) explicitly planned remaining gates.
  const perStepGateRate = clamp01(DEFAULT_BASELINE.baseGateRate * (1 + severity.score / 200));
  const stepsLeft = Math.max(1, Math.round(sig.expectedRemainingSteps));
  const pStepGate = clamp01(1 - (1 - perStepGateRate) ** stepsLeft);
  const gateCertainty = 0.9; // each *planned* gate is expected ~90% of the time
  const pPlannedGates =
    sig.gatesRemaining > 0 ? clamp01(1 - (1 - gateCertainty) ** sig.gatesRemaining) : 0;
  const probGate = clamp01(1 - (1 - pStepGate) * (1 - pPlannedGates));
  const gateBasis =
    `per-step gate rate ${round(perStepGateRate, 4)} over ${stepsLeft} remaining steps` +
    (sig.gatesRemaining > 0
      ? ` + ${sig.gatesRemaining} planned gate(s) @ ${gateCertainty} each, combined by independent union`
      : " (no planned gates)");

  // --- ETA to next gate ---------------------------------------------------
  const stepMin = 60 / stepsPerHour;
  let etaP50: number | null;
  let etaP90: number | null;
  let etaBasis: string;
  const gateExpected = sig.gatesRemaining > 0;
  if (gateExpected) {
    const stepsPerGate = stepsLeft / sig.gatesRemaining;
    etaP50 = round(Math.ceil(stepsPerGate) * stepMin, 1);
    etaP90 = round(etaP50 * 1.8, 1);
    etaBasis = `next of ${sig.gatesRemaining} planned gate(s) in ~${Math.ceil(stepsPerGate)} step(s) at ${stepsPerHour} steps/hr`;
  } else {
    etaP50 = null;
    etaP90 = null;
    etaBasis = "no human gate planned before completion";
  }

  // --- Review / recovery time --------------------------------------------
  const review = resolvePercentiles("human review", sig.observed.reviewDurationsMin, DEFAULT_BASELINE.baseReviewMin, sevMult);
  const recovery = resolvePercentiles("recovery", sig.observed.recoveryDurationsMin, DEFAULT_BASELINE.baseRecoveryMin, sevMult);

  // --- Mode ---------------------------------------------------------------
  const mode = recommendMode(severity.score, probNextK, probGate, fp.providerHealth, repeatedFailures);

  // --- Uncertainty --------------------------------------------------------
  const sampleSizes = {
    exception: sig.observed.exceptionCounts.length,
    review: sig.observed.reviewDurationsMin.length,
    recovery: sig.observed.recoveryDurationsMin.length,
  };
  const limitations: string[] = [
    "Deterministic rules on limited signals; not a statistical model.",
    "Default baselines are plausible placeholders, not measured values.",
    "Assumes steps are roughly homogeneous and independent.",
  ];
  if (fp.providerHealth === "unknown") limitations.push("provider health unknown (treated as risk).");
  if (sig.observed.exceptionCounts.length < MIN_SAMPLE.exceptionRate)
    limitations.push(`exception rate uses default (need >= ${MIN_SAMPLE.exceptionRate} observed steps).`);
  if (sampleSizes.review < 3) limitations.push("review time uses default baseline (< 3 samples).");
  if (sampleSizes.recovery < 3) limitations.push("recovery time uses default baseline (< 3 samples).");
  if (k < 3) limitations.push(`short horizon k=${k}; long-range risk under-stated.`);
  const level: "low" | "medium" | "high" =
    severity.score >= 55 || fp.providerHealth === "down" || fp.providerHealth === "unknown"
      ? "high"
      : severity.score >= 30 || sampleSizes.exception < MIN_SAMPLE.exceptionRate
        ? "medium"
        : "low";

  return {
    input: {
      fingerprint: fp,
      k,
      expectedRemainingSteps: stepsLeft,
      stepsPerHour,
      completionProgress: sig.completionProgress,
      gatesRemaining: sig.gatesRemaining,
    },
    severity,
    exception: {
      k,
      perStepRate: round(perStepRate, 4),
      probNextK: round(probNextK, 4),
      source: excSource,
      basis: excBasis,
    },
    gate: {
      probBeforeCompletion: round(probGate, 4),
      gateExpected,
      basis: gateBasis,
    },
    etaToNextGateMin: {
      p50: etaP50,
      p90: etaP90,
      gateExpected,
      basis: etaBasis,
    },
    reviewTimeMin: review,
    recoveryTimeMin: recovery,
    mode,
    uncertainty: { level, sampleSizes, limitations },
  };
}

// ---------------------------------------------------------------------------
// Calibration. Predicted and observed are NEVER merged into a single number.
// Accuracy is computed only from matched predicted+observed pairs and is
// reported as null (with a note) until there is enough matched data.
// ---------------------------------------------------------------------------

export interface CalibrationRecord {
  predicted: {
    exceptionProbNextK: number;
    gateProb: number;
    etaGateMin: number | null;
    reviewMinP50: number | null;
    recoveryMinP50: number | null;
  };
  observed: {
    exceptionOccurred: boolean | null; // null = not yet known
    gateOccurred: boolean | null;
    gateMin: number | null;
    reviewMin: number | null;
    recoveryMin: number | null;
  };
}

export interface CalibrationSummary {
  n: number;
  nMatchedException: number;
  nMatchedGate: number;
  nMatchedReview: number;
  nMatchedRecovery: number;
  metrics: {
    exceptionBrier: number | null;
    gateBrier: number | null;
    gateMAEmin: number | null;
    reviewMAEmin: number | null;
    recoveryMAEmin: number | null;
  };
  note: string;
  sufficientForAccuracy: boolean;
}

/** Build a single record from a forecast plus the (possibly incomplete) outcome. */
export function buildCalibrationRecord(
  f: Forecast,
  outcome: Partial<CalibrationRecord["observed"]> = {},
): CalibrationRecord {
  return {
    predicted: {
      exceptionProbNextK: f.exception.probNextK,
      gateProb: f.gate.probBeforeCompletion,
      etaGateMin: f.etaToNextGateMin.p50,
      reviewMinP50: f.reviewTimeMin.p50,
      recoveryMinP50: f.recoveryTimeMin.p50,
    },
    observed: {
      exceptionOccurred: outcome.exceptionOccurred ?? null,
      gateOccurred: outcome.gateOccurred ?? null,
      gateMin: outcome.gateMin ?? null,
      reviewMin: outcome.reviewMin ?? null,
      recoveryMin: outcome.recoveryMin ?? null,
    },
  };
}

const MIN_ACCURACY_SAMPLES = 5;

/**
 * Deterministic calibration metrics. Each metric is `null` (not 0) when there
 * are fewer than MIN_ACCURACY_SAMPLES matched pairs for that field, so the
 * absence of evidence is never reported as a number.
 */
export function calibrationSummary(records: CalibrationRecord[]): CalibrationSummary {
  const n = records.length;
  let nE = 0, nG = 0, nR = 0, nRe = 0;
  let brierE = 0, brierG = 0, maeG = 0, maeR = 0, maeRe = 0;

  for (const r of records) {
    if (r.observed.exceptionOccurred !== null && r.observed.exceptionOccurred !== undefined) {
      const o = r.observed.exceptionOccurred ? 1 : 0;
      brierE += (r.predicted.exceptionProbNextK - o) ** 2;
      nE++;
    }
    if (r.observed.gateOccurred !== null && r.observed.gateOccurred !== undefined) {
      const o = r.observed.gateOccurred ? 1 : 0;
      brierG += (r.predicted.gateProb - o) ** 2;
      nG++;
    }
    if (r.observed.gateMin !== null && r.predicted.etaGateMin !== null) {
      maeG += Math.abs(r.predicted.etaGateMin - r.observed.gateMin);
      nG++;
    }
    if (r.observed.reviewMin !== null && r.predicted.reviewMinP50 !== null) {
      maeR += Math.abs(r.predicted.reviewMinP50 - r.observed.reviewMin);
      nR++;
    }
    if (r.observed.recoveryMin !== null && r.predicted.recoveryMinP50 !== null) {
      maeRe += Math.abs(r.predicted.recoveryMinP50 - r.observed.recoveryMin);
      nRe++;
    }
  }

  const m = (acc: number, count: number): number | null =>
    count >= MIN_ACCURACY_SAMPLES ? round(acc / count, 4) : null;

  const metrics = {
    exceptionBrier: m(brierE, nE),
    gateBrier: m(brierG, nG),
    gateMAEmin: m(maeG, nG),
    reviewMAEmin: m(maeR, nR),
    recoveryMAEmin: m(maeRe, nRe),
  };
  const sufficient = nE >= MIN_ACCURACY_SAMPLES || nG >= MIN_ACCURACY_SAMPLES;
  const note = sufficient
    ? "computed from matched predicted+observed pairs only"
    : `insufficient matched samples (need >= ${MIN_ACCURACY_SAMPLES}); metrics are null, not 0 — accuracy is not asserted from predictions`;

  return {
    n,
    nMatchedException: nE,
    nMatchedGate: nG,
    nMatchedReview: nR,
    nMatchedRecovery: nRe,
    metrics,
    note,
    sufficientForAccuracy: sufficient,
  };
}

// ---------------------------------------------------------------------------
// Input validation (light; throws on structurally invalid input).
// ---------------------------------------------------------------------------

export function validateInput(input: ForecastInput): void {
  if (!input || !input.fingerprint || !input.signals) throw new Error("input.fingerprint/signals required");
  const fp = input.fingerprint;
  for (const key of ["model", "provider", "tool", "repository"] as const) {
    if (typeof fp[key] !== "string") throw new Error(`fingerprint.${key} must be a string`);
  }
  if (!("providerHealth" in fp)) throw new Error("fingerprint.providerHealth required");
  const sig = input.signals;
  if (!Array.isArray(sig.steps)) throw new Error("signals.steps must be an array");
  if (typeof sig.k !== "number") throw new Error("signals.k must be a number");
  if (typeof sig.stepsPerHour !== "number") throw new Error("signals.stepsPerHour must be a number");
  if (!sig.observed || !Array.isArray(sig.observed.exceptionCounts)) throw new Error("signals.observed required");
}
