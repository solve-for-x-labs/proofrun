/**
 * Deterministic input fixtures. Each one is a fully-specified ForecastInput so
 * that tests and examples are reproducible. No randomness, no clock, no network.
 *
 * Fixtures:
 *   - normalSuccess      : healthy provider/tool/repo, clean recent steps, no
 *                          observed history -> default baselines, low severity.
 *   - repeatedFailure    : 3+ recent failures + provider degraded -> high
 *                          severity, elevated exception prob, PAUSE/HARD_BLOCK.
 *   - riskyChange        : untrusted repo + tool degraded + planned gates ->
 *                          elevated gate prob and NOTIFY/PAUSE.
 *   - providerHealthMissing : providerHealth "unknown" + no gate plan ->
 *                          treated as risk (higher severity than "ok"), no ETA.
 *   - empiricalHistory   : enough observed history to replace the default
 *                          exception rate and review/recovery percentiles.
 */

import type { ForecastInput } from "./index.ts";

const clean = {
  model: "deepseek-v3",
  provider: "deepseek",
  tool: "bash",
  repository: "proofrun/forecast",
};

/** 1. Normal, healthy success. */
export const normalSuccess: ForecastInput = {
  fingerprint: {
    ...clean,
    providerHealth: "ok",
    toolHealth: "ok",
    repoTrust: "trusted",
  },
  signals: {
    k: 5,
    stepsPerHour: 12,
    expectedRemainingSteps: 8,
    gatesRemaining: 0,
    completionProgress: 0.55,
    steps: [
      { index: 0, status: "success", gate: null, gateDurationMin: null, durationMs: 4000, errors: [] },
      { index: 1, status: "success", gate: null, gateDurationMin: null, durationMs: 3000, errors: [] },
      { index: 2, status: "success", gate: null, gateDurationMin: null, durationMs: 3500, errors: [] },
    ],
    observed: { reviewDurationsMin: [], recoveryDurationsMin: [], exceptionCounts: [] },
  },
};

/** 2. Repeated failures on a degraded provider. */
export const repeatedFailure: ForecastInput = {
  fingerprint: {
    model: "deepseek-v3",
    provider: "deepseek",
    providerHealth: "degraded",
    tool: "bash",
    toolHealth: "ok",
    repository: "proofrun/forecast",
    repoTrust: "trusted",
  },
  signals: {
    k: 5,
    stepsPerHour: 10,
    expectedRemainingSteps: 10,
    gatesRemaining: 1,
    completionProgress: 0.4,
    steps: [
      { index: 0, status: "failure", gate: null, gateDurationMin: null, durationMs: 5000, errors: ["timeout"] },
      { index: 1, status: "failure", gate: null, gateDurationMin: null, durationMs: 5000, errors: ["timeout"] },
      { index: 2, status: "failure", gate: null, gateDurationMin: null, durationMs: 6000, errors: ["timeout", "retry-exhausted"] },
      { index: 3, status: "failure", gate: null, gateDurationMin: null, durationMs: 5500, errors: ["timeout"] },
    ],
    observed: { reviewDurationsMin: [], recoveryDurationsMin: [], exceptionCounts: [] },
  },
};

/** 3. Risky change: untrusted repo, degraded tool, planned human gate. */
export const riskyChange: ForecastInput = {
  fingerprint: {
    model: "deepseek-v3",
    provider: "deepseek",
    providerHealth: "ok",
    tool: "edit",
    toolHealth: "degraded",
    repository: "vendor/third-party",
    repoTrust: "untrusted",
  },
  signals: {
    k: 5,
    stepsPerHour: 12,
    expectedRemainingSteps: 6,
    gatesRemaining: 2,
    completionProgress: 0.5,
    steps: [
      { index: 0, status: "success", gate: "approval", gateDurationMin: 8, durationMs: 4000, errors: [] },
      { index: 1, status: "success", gate: null, gateDurationMin: null, durationMs: 3000, errors: [] },
    ],
    observed: { reviewDurationsMin: [], recoveryDurationsMin: [], exceptionCounts: [] },
  },
};

/** 4. Missing provider health ("unknown"). */
export const providerHealthMissing: ForecastInput = {
  fingerprint: {
    model: "deepseek-v3",
    provider: "deepseek",
    providerHealth: "unknown",
    tool: "bash",
    toolHealth: "unknown",
    repository: "proofrun/forecast",
    repoTrust: "trusted",
  },
  signals: {
    k: 5,
    stepsPerHour: 12,
    expectedRemainingSteps: 8,
    gatesRemaining: 0,
    completionProgress: 0.5,
    steps: [
      { index: 0, status: "success", gate: null, gateDurationMin: null, durationMs: 4000, errors: [] },
      { index: 1, status: "success", gate: null, gateDurationMin: null, durationMs: 3500, errors: [] },
    ],
    observed: { reviewDurationsMin: [], recoveryDurationsMin: [], exceptionCounts: [] },
  },
};

/** 5. Enough empirical history to replace defaults. */
export const empiricalHistory: ForecastInput = {
  fingerprint: {
    ...clean,
    providerHealth: "ok",
    toolHealth: "ok",
    repoTrust: "trusted",
  },
  signals: {
    k: 5,
    stepsPerHour: 12,
    expectedRemainingSteps: 8,
    gatesRemaining: 1,
    completionProgress: 0.5,
    steps: [
      { index: 0, status: "success", gate: null, gateDurationMin: null, durationMs: 4000, errors: [] },
      { index: 1, status: "failure", gate: null, gateDurationMin: null, durationMs: 5000, errors: ["compile"] },
      { index: 2, status: "success", gate: "confirmation", gateDurationMin: 6, durationMs: 4000, errors: [] },
    ],
    observed: {
      // 12 steps, 2 exceptions -> observed per-step rate 2/12 = 0.1667
      exceptionCounts: [0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0],
      reviewDurationsMin: [4, 6, 5, 9, 12, 8, 6, 7],
      recoveryDurationsMin: [9, 11, 8, 14, 20, 10, 12, 9],
    },
  },
};

export const FIXTURES = {
  normalSuccess,
  repeatedFailure,
  riskyChange,
  providerHealthMissing,
  empiricalHistory,
} as const;

export type FixtureName = keyof typeof FIXTURES;
export const FIXTURE_NAMES = Object.keys(FIXTURES) as FixtureName[];
