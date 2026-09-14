export type GateKind = "intent" | "circuit_breaker" | "blast_radius";
export type Decision = "approve" | "reject" | "revise" | "rollback";
export type AutonomyMode = "AUTO" | "NOTIFY" | "PAUSE" | "HARD_BLOCK";

export interface RunFingerprint {
  runId: string;
  model: string;
  provider: string;
  tools: string[];
  repository: string;
  commit: string;
  startedAt: string;
}

export interface Forecast {
  exceptionNextKSteps: number;
  humanGateBeforeFinish: number;
  etaToGateSeconds?: number;
  reviewTimeP50Seconds?: number;
  reviewTimeP90Seconds?: number;
  recoveryTimeP50Seconds?: number;
  recommendedMode: AutonomyMode;
  basis: "rules" | "empirical" | "calibrated";
}

export interface GateDecision {
  gate: GateKind;
  decision: Decision;
  reason: string;
  evidenceRefs: string[];
  decidedAt: string;
}
