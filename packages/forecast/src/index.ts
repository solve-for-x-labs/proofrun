export type Mode = "AUTO" | "NOTIFY" | "PAUSE" | "HARD_BLOCK";
export interface ForecastInput { steps: number; failures: number; plannedGates: number; changedFiles: number; providerHealth: "healthy" | "degraded" | "unknown"; }
export interface Forecast { exceptionNextKSteps: number; humanGateBeforeFinish: number; recommendedMode: Mode; etaToGateSeconds: number | null; reviewTimeP50Seconds: number; recoveryTimeP50Seconds: number; basis: "rules" | "empirical"; uncertainty: { samples: number; limitations: string[] }; }
export function forecast(input: ForecastInput): Forecast {
  const failureRate = input.steps ? input.failures / input.steps : 0;
  const exception = Math.min(0.99, Math.max(0, 0.08 + failureRate * 0.7 + (input.providerHealth === "unknown" ? 0.12 : input.providerHealth === "degraded" ? 0.2 : 0) + input.changedFiles * 0.01));
  const gate = Math.min(0.99, input.plannedGates ? 0.12 + input.plannedGates * 0.28 : 0);
  const mode: Mode = input.failures >= 3 ? "HARD_BLOCK" : exception >= 0.5 ? "PAUSE" : exception >= 0.2 || gate >= 0.8 ? "NOTIFY" : "AUTO";
  return { exceptionNextKSteps: Number(exception.toFixed(4)), humanGateBeforeFinish: Number(gate.toFixed(4)), recommendedMode: mode, etaToGateSeconds: input.plannedGates ? input.plannedGates * 90 : null, reviewTimeP50Seconds: 45 + input.changedFiles * 15, recoveryTimeP50Seconds: input.failures ? 120 + input.failures * 60 : 0, basis: "rules", uncertainty: { samples: 0, limitations: ["Rules-first placeholder until real run history is collected.", "No model confidence is used."] } };
}
