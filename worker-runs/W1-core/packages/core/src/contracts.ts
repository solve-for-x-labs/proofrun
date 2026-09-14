/**
 * @proofrun/core — first core contract slice.
 *
 * Typed contracts + deterministic validators + a tiny run/gate state machine
 * for the ProofRun vertical slice (see docs/WAVE-0.md).
 *
 * Design rules honored here:
 *  - Every contract object carries a `source` field = its source-level type
 *    name, so a serialized value self-identifies which schema it satisfies.
 *  - Every discriminated field is an explicit string-literal union, and the
 *    allowed values are also exported as runtime const arrays (single source of
 *    truth for both types and validators).
 *  - No runtime dependencies. Pure, deterministic, importable by a plain
 *    `.mjs` test via Node native TS type-stripping.
 */

// ---------------------------------------------------------------------------
// Explicit unions (single source of truth: const array <-> type alias)
// ---------------------------------------------------------------------------

/** Source-level names of every contract object type. */
export const CONTRACT_SOURCE_NAMES = [
  "TaskSpec",
  "RunFingerprint",
  "RunEvent",
  "Forecast",
  "GateDecision",
  "EvidenceManifest",
] as const;
export type ContractSourceName = (typeof CONTRACT_SOURCE_NAMES)[number];

/** Which gate a GateDecision or gate_request refers to. */
export const GATE_KINDS = ["intent", "circuit_breaker", "blast_radius"] as const;
export type GateKind = (typeof GATE_KINDS)[number];

/** What a human does at an irreversible boundary. */
export const DECISIONS = ["approve", "reject", "revise", "rollback"] as const;
export type Decision = (typeof DECISIONS)[number];

/** Autonomy mode the forecast recommends (README: humans decide at boundaries). */
export const AUTONOMY_MODES = ["AUTO", "NOTIFY", "PAUSE", "HARD_BLOCK"] as const;
export type AutonomyMode = (typeof AUTONOMY_MODES)[number];

/** Provenance of a forecast probability (README: self-confidence != ground truth). */
export const PROBABILITY_BASES = ["rules", "empirical", "calibrated"] as const;
export type ProbabilityBasis = (typeof PROBABILITY_BASES)[number];

/** Kind of state mutation an agent run emits. */
export const RUN_EVENT_KINDS = [
  "run_started",
  "step_start",
  "step_complete",
  "step_failure",
  "forecast_update",
  "gate_request",
  "gate_decision",
  "run_completed",
  "run_aborted",
  "circuit_break_opened",
] as const;
export type RunEventKind = (typeof RUN_EVENT_KINDS)[number];

/** Permission scope values used by a TaskSpec. */
export const PERMISSION_VALUES = [
  "deny",
  "workspace-read",
  "workspace-write",
  "approval-required",
] as const;
export type PermissionValue = (typeof PERMISSION_VALUES)[number];

/** Lifecycle states of an agent run. */
export const RUN_STATES = [
  "planned",
  "running",
  "paused_at_gate",
  "completed",
  "aborted",
  "circuit_break",
] as const;
export type RunState = (typeof RUN_STATES)[number];

/** Lifecycle states of a gate (requested -> decided -> terminal). */
export const GATE_STATES = ["idle", "requested", "decided", "trip_open"] as const;
export type GateState = (typeof GATE_STATES)[number];

// ---------------------------------------------------------------------------
// Contract object shapes
// ---------------------------------------------------------------------------

/** Permission envelope constraining what an agent run may do. */
export interface TaskPermissions {
  filesystem: PermissionValue;
  network: PermissionValue;
  externalActions: PermissionValue;
}

/**
 * A concrete unit of agent work (mirrors schemas/task-spec.example.json).
 * `source` is always the literal "TaskSpec".
 */
export interface TaskSpec {
  source: "TaskSpec";
  id: string;
  task: string;
  repository: string;
  permissions: TaskPermissions;
  /** Commands that must pass for the run to be considered green. */
  checks: string[];
  /** Gate configuration. */
  gates: {
    intent: "required" | "optional";
    circuitBreakerAfterFailures: number;
    blastRadius: "required" | "optional";
  };
}

/** Immutable identity of one run (README: every run has a fingerprint + run ID). */
export interface RunFingerprint {
  source: "RunFingerprint";
  runId: string;
  model: string;
  provider: string;
  tools: string[];
  repository: string;
  commit: string;
  startedAt: string; // ISO-8601
}

/** One state mutation emitted by a run; monotonically ordered by `seq`. */
export interface RunEvent {
  source: "RunEvent";
  runId: string;
  seq: number; // 1-based, strictly increasing within a run
  kind: RunEventKind;
  at: string; // ISO-8601
  payload: Record<string, unknown>;
}

/**
 * Exception forecast. `basis` is the probability basis, `recommendedMode` the
 * recommended autonomy mode (acceptance criteria, item 2).
 */
export interface Forecast {
  source: "Forecast";
  runId: string;
  at: string; // ISO-8601
  /** P(exception within the next k steps), in [0, 1]. */
  exceptionNextKSteps: number;
  /** P(a human gate is required before the run can finish), in [0, 1]. */
  humanGateBeforeFinish: number;
  /** Where the probabilities come from. */
  basis: ProbabilityBasis;
  /** The autonomy mode this forecast recommends. */
  recommendedMode: AutonomyMode;
  kSteps: number; // horizon for exceptionNextKSteps
  etaToGateSeconds?: number;
  reviewTimeP50Seconds?: number;
  reviewTimeP90Seconds?: number;
  recoveryTimeP50Seconds?: number;
}

/**
 * A human decision at a gate. `evidenceRefs` + `decidedAt` are mandatory
 * (acceptance criteria, item 3).
 */
export interface GateDecision {
  source: "GateDecision";
  runId: string;
  gate: GateKind;
  decision: Decision;
  reason: string;
  evidenceRefs: string[]; // references into an EvidenceManifest
  decidedAt: string; // ISO-8601
}

/** A single verifiable artifact in the evidence package. */
export interface EvidenceItem {
  ref: string;
  type: "test" | "rollback" | "diff" | "log" | "screenshot";
  source: string; // path / id this evidence came from
  summary: string;
}

/**
 * Reversible evidence package for a run (Wave-0 AC #6: tests + rollback ref).
 * `source` is always the literal "EvidenceManifest".
 */
export interface EvidenceManifest {
  source: "EvidenceManifest";
  runId: string;
  items: EvidenceItem[];
  /** At least one ref that points at the rollback procedure / target. */
  rollbackRef: string;
  /** At least one ref that points at passing test evidence. */
  testRefs: string[];
}

// ---------------------------------------------------------------------------
// Validation helpers (pure, no deps)
// ---------------------------------------------------------------------------

export type ValidationOk<T> = { ok: true; value: T };
export type ValidationErr = { ok: false; errors: string[] };
export type ValidationResult<T> = ValidationOk<T> | ValidationErr;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}
function isInt(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v);
}
function isProb(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1;
}
function isIso(v: unknown): v is string {
  return typeof v === "string" && !Number.isNaN(Date.parse(v));
}
function inUnion<const U extends readonly string[]>(v: unknown, union: U): v is U[number] {
  return typeof v === "string" && (union as readonly string[]).includes(v);
}

function bad(errors: string[]): ValidationErr {
  return { ok: false, errors };
}
function good<T>(value: T): ValidationOk<T> {
  return { ok: true, value };
}

// ---------------------------------------------------------------------------
// Per-type validators
// ---------------------------------------------------------------------------

export function validateTaskSpec(input: unknown): ValidationResult<TaskSpec> {
  if (!isPlainObject(input)) return bad(["TaskSpec: not an object"]);
  const errors: string[] = [];
  if (input.source !== "TaskSpec") errors.push('TaskSpec.source must be "TaskSpec"');
  if (!isNonEmptyString(input.id)) errors.push("TaskSpec.id: non-empty string");
  if (!isNonEmptyString(input.task)) errors.push("TaskSpec.task: non-empty string");
  if (!isNonEmptyString(input.repository)) errors.push("TaskSpec.repository: non-empty string");

  if (!isPlainObject(input.permissions)) {
    errors.push("TaskSpec.permissions: object");
  } else {
    for (const field of ["filesystem", "network", "externalActions"] as const) {
      if (!inUnion(input.permissions[field], PERMISSION_VALUES)) {
        errors.push(`TaskSpec.permissions.${field}: one of ${PERMISSION_VALUES.join("|")}`);
      }
    }
  }

  if (!Array.isArray(input.checks) || input.checks.length === 0) {
    errors.push("TaskSpec.checks: non-empty array");
  } else if (!input.checks.every(isNonEmptyString)) {
    errors.push("TaskSpec.checks: all entries non-empty strings");
  }

  if (!isPlainObject(input.gates)) {
    errors.push("TaskSpec.gates: object");
  } else {
    const g = input.gates;
    if (g.intent !== "required" && g.intent !== "optional") {
      errors.push('TaskSpec.gates.intent: "required"|"optional"');
    }
    if (!isInt(g.circuitBreakerAfterFailures) || (g.circuitBreakerAfterFailures as number) < 1) {
      errors.push("TaskSpec.gates.circuitBreakerAfterFailures: integer >= 1");
    }
    if (g.blastRadius !== "required" && g.blastRadius !== "optional") {
      errors.push('TaskSpec.gates.blastRadius: "required"|"optional"');
    }
  }

  return errors.length ? bad(errors) : good(input as unknown as TaskSpec);
}

export function validateRunFingerprint(input: unknown): ValidationResult<RunFingerprint> {
  if (!isPlainObject(input)) return bad(["RunFingerprint: not an object"]);
  const errors: string[] = [];
  if (input.source !== "RunFingerprint") errors.push('RunFingerprint.source must be "RunFingerprint"');
  if (!isNonEmptyString(input.runId)) errors.push("RunFingerprint.runId: non-empty string");
  if (!isNonEmptyString(input.model)) errors.push("RunFingerprint.model: non-empty string");
  if (!isNonEmptyString(input.provider)) errors.push("RunFingerprint.provider: non-empty string");
  if (!Array.isArray(input.tools) || input.tools.length === 0) {
    errors.push("RunFingerprint.tools: non-empty array");
  } else if (!input.tools.every(isNonEmptyString)) {
    errors.push("RunFingerprint.tools: all entries non-empty strings");
  }
  if (!isNonEmptyString(input.repository)) errors.push("RunFingerprint.repository: non-empty string");
  if (!isNonEmptyString(input.commit)) errors.push("RunFingerprint.commit: non-empty string");
  if (!isIso(input.startedAt)) errors.push("RunFingerprint.startedAt: ISO-8601");
  return errors.length ? bad(errors) : good(input as unknown as RunFingerprint);
}

export function validateRunEvent(input: unknown): ValidationResult<RunEvent> {
  if (!isPlainObject(input)) return bad(["RunEvent: not an object"]);
  const errors: string[] = [];
  if (input.source !== "RunEvent") errors.push('RunEvent.source must be "RunEvent"');
  if (!isNonEmptyString(input.runId)) errors.push("RunEvent.runId: non-empty string");
  if (!isInt(input.seq) || (input.seq as number) < 1) errors.push("RunEvent.seq: integer >= 1");
  if (!inUnion(input.kind, RUN_EVENT_KINDS)) errors.push(`RunEvent.kind: one of ${RUN_EVENT_KINDS.join("|")}`);
  if (!isIso(input.at)) errors.push("RunEvent.at: ISO-8601");
  if (!isPlainObject(input.payload)) errors.push("RunEvent.payload: object");
  return errors.length ? bad(errors) : good(input as unknown as RunEvent);
}

export function validateForecast(input: unknown): ValidationResult<Forecast> {
  if (!isPlainObject(input)) return bad(["Forecast: not an object"]);
  const errors: string[] = [];
  if (input.source !== "Forecast") errors.push('Forecast.source must be "Forecast"');
  if (!isNonEmptyString(input.runId)) errors.push("Forecast.runId: non-empty string");
  if (!isIso(input.at)) errors.push("Forecast.at: ISO-8601");
  if (!isProb(input.exceptionNextKSteps)) errors.push("Forecast.exceptionNextKSteps: number in [0,1]");
  if (!isProb(input.humanGateBeforeFinish)) errors.push("Forecast.humanGateBeforeFinish: number in [0,1]");
  if (!inUnion(input.basis, PROBABILITY_BASES)) {
    errors.push(`Forecast.basis (probability basis): one of ${PROBABILITY_BASES.join("|")}`);
  }
  if (!inUnion(input.recommendedMode, AUTONOMY_MODES)) {
    errors.push(`Forecast.recommendedMode (autonomy mode): one of ${AUTONOMY_MODES.join("|")}`);
  }
  if (!isInt(input.kSteps) || (input.kSteps as number) < 1) errors.push("Forecast.kSteps: integer >= 1");
  for (const opt of ["etaToGateSeconds", "reviewTimeP50Seconds", "reviewTimeP90Seconds", "recoveryTimeP50Seconds"] as const) {
    if (input[opt] !== undefined && (!isInt(input[opt]) || (input[opt] as number) < 0)) {
      errors.push(`Forecast.${opt}: non-negative integer`);
    }
  }
  return errors.length ? bad(errors) : good(input as unknown as Forecast);
}

export function validateGateDecision(input: unknown): ValidationResult<GateDecision> {
  if (!isPlainObject(input)) return bad(["GateDecision: not an object"]);
  const errors: string[] = [];
  if (input.source !== "GateDecision") errors.push('GateDecision.source must be "GateDecision"');
  if (!isNonEmptyString(input.runId)) errors.push("GateDecision.runId: non-empty string");
  if (!inUnion(input.gate, GATE_KINDS)) errors.push(`GateDecision.gate: one of ${GATE_KINDS.join("|")}`);
  if (!inUnion(input.decision, DECISIONS)) errors.push(`GateDecision.decision: one of ${DECISIONS.join("|")}`);
  if (!isNonEmptyString(input.reason)) errors.push("GateDecision.reason: non-empty string");
  if (!Array.isArray(input.evidenceRefs) || input.evidenceRefs.length === 0) {
    errors.push("GateDecision.evidenceRefs: non-empty array");
  } else if (!input.evidenceRefs.every(isNonEmptyString)) {
    errors.push("GateDecision.evidenceRefs: all entries non-empty strings");
  }
  if (!isIso(input.decidedAt)) errors.push("GateDecision.decidedAt (timestamp): ISO-8601");
  return errors.length ? bad(errors) : good(input as unknown as GateDecision);
}

export function validateEvidenceManifest(input: unknown): ValidationResult<EvidenceManifest> {
  if (!isPlainObject(input)) return bad(["EvidenceManifest: not an object"]);
  const errors: string[] = [];
  if (input.source !== "EvidenceManifest") errors.push('EvidenceManifest.source must be "EvidenceManifest"');
  if (!isNonEmptyString(input.runId)) errors.push("EvidenceManifest.runId: non-empty string");

  const itemTypes = ["test", "rollback", "diff", "log", "screenshot"] as const;
  if (!Array.isArray(input.items) || input.items.length === 0) {
    errors.push("EvidenceManifest.items: non-empty array");
  } else {
    for (let i = 0; i < (input.items as unknown[]).length; i++) {
      const it = (input.items as unknown[])[i];
      if (!isPlainObject(it)) {
        errors.push(`EvidenceManifest.items[${i}]: object`);
        continue;
      }
      if (!isNonEmptyString(it.ref)) errors.push(`EvidenceManifest.items[${i}].ref: non-empty string`);
      if (!inUnion(it.type, itemTypes)) errors.push(`EvidenceManifest.items[${i}].type: one of ${itemTypes.join("|")}`);
      if (!isNonEmptyString(it.source)) errors.push(`EvidenceManifest.items[${i}].source: non-empty string`);
      if (!isNonEmptyString(it.summary)) errors.push(`EvidenceManifest.items[${i}].summary: non-empty string`);
    }
  }
  if (!isNonEmptyString(input.rollbackRef)) errors.push("EvidenceManifest.rollbackRef: non-empty string");
  if (!Array.isArray(input.testRefs) || input.testRefs.length === 0) {
    errors.push("EvidenceManifest.testRefs: non-empty array");
  } else if (!input.testRefs.every(isNonEmptyString)) {
    errors.push("EvidenceManifest.testRefs: all entries non-empty strings");
  }
  return errors.length ? bad(errors) : good(input as unknown as EvidenceManifest);
}

/** Validate any contract object by its `source` discriminator. */
export function validateContract(input: unknown): ValidationResult<
  TaskSpec | RunFingerprint | RunEvent | Forecast | GateDecision | EvidenceManifest
> {
  if (!isPlainObject(input)) return bad(["contract: not an object"]);
  if (!inUnion(input.source, CONTRACT_SOURCE_NAMES)) {
    return bad([`contract.source: one of ${CONTRACT_SOURCE_NAMES.join("|")}`]);
  }
  switch (input.source) {
    case "TaskSpec":
      return validateTaskSpec(input);
    case "RunFingerprint":
      return validateRunFingerprint(input);
    case "RunEvent":
      return validateRunEvent(input);
    case "Forecast":
      return validateForecast(input);
    case "GateDecision":
      return validateGateDecision(input);
    case "EvidenceManifest":
      return validateEvidenceManifest(input);
  }
  return bad(["contract: unhandled source"]);
}

// ---------------------------------------------------------------------------
// State machines (deterministic; invalid transitions throw)
// ---------------------------------------------------------------------------

export class InvalidTransitionError extends Error {
  readonly from: string;
  readonly to: string;
  readonly machine: "run" | "gate" | "circuit_breaker";
  constructor(from: string, to: string, machine: "run" | "gate" | "circuit_breaker") {
    super(`[${machine}] invalid transition ${from} -> ${to}`);
    this.name = "InvalidTransitionError";
    this.from = from;
    this.to = to;
    this.machine = machine;
  }
}

/** Run lifecycle graph (Wave-0: planned -> running -> ... -> terminal). */
const RUN_TRANSITIONS: Record<RunState, readonly RunState[]> = {
  planned: ["running"],
  running: ["paused_at_gate", "completed", "aborted", "circuit_break"],
  paused_at_gate: ["running", "aborted"],
  completed: [],
  aborted: [],
  circuit_break: ["running"], // resume only after a human resets the breaker
};

export function transitionRunState(from: RunState, to: RunState): RunState {
  if (!RUN_STATES.includes(from)) throw new InvalidTransitionError(from, to, "run");
  if (!RUN_STATES.includes(to)) throw new InvalidTransitionError(from, to, "run");
  if (!RUN_TRANSITIONS[from].includes(to)) throw new InvalidTransitionError(from, to, "run");
  return to;
}

/** Gate lifecycle: a gate can only be decided after it has been requested. */
const GATE_TRANSITIONS: Record<GateState, readonly GateState[]> = {
  idle: ["requested"],
  requested: ["decided", "trip_open"],
  decided: [],
  trip_open: ["requested"], // a re-request after a trip is a fresh gate
};

export function transitionGateState(from: GateState, to: GateState): GateState {
  if (!GATE_STATES.includes(from)) throw new InvalidTransitionError(from, to, "gate");
  if (!GATE_STATES.includes(to)) throw new InvalidTransitionError(from, to, "gate");
  if (!GATE_TRANSITIONS[from].includes(to)) throw new InvalidTransitionError(from, to, "gate");
  return to;
}

/**
 * Repeated-failure circuit breaker (Wave-0 AC #3: 3 repeated failures open it).
 * `count` is the number of consecutive failures observed; the breaker opens when
 * `count >= threshold`. Returns the gate state this implies.
 */
export function circuitBreakerState(count: number, threshold: number): GateState {
  if (!isInt(count) || count < 0) throw new InvalidTransitionError(String(count), String(count), "circuit_breaker");
  if (!isInt(threshold) || threshold < 1) throw new InvalidTransitionError(String(threshold), String(threshold), "circuit_breaker");
  return count >= threshold ? "trip_open" : "idle";
}

/** True when the given failure events have tripped the breaker. */
export function breakerTripped(events: readonly RunEvent[], threshold: number): boolean {
  const failures = events.filter((e) => e.kind === "step_failure").length;
  return circuitBreakerState(failures, threshold) === "trip_open";
}
