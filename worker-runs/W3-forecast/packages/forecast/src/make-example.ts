/**
 * Generates artifacts/forecast/example.json deterministically from fixtures.
 * No network, no clock, no model, no credentials. Run: node src/make-example.ts
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { forecast, buildCalibrationRecord, calibrationSummary } from "./index.ts";
import { FIXTURES, FIXTURE_NAMES } from "./fixtures.ts";

const here = dirname(fileURLToPath(import.meta.url));
const outPath = join(here, "..", "..", "..", "artifacts", "forecast", "example.json");

const examples: Record<string, unknown> = {};
for (const name of FIXTURE_NAMES) {
  examples[name] = forecast(FIXTURES[name]);
}

// A small calibration set: forecast the normalSuccess fixture, then "observe"
// one (imperfect) outcome to show predicted vs observed kept separate.
const fNormal = forecast(FIXTURES.normalSuccess);
const calibration = {
  records: [
    buildCalibrationRecord(fNormal, { exceptionOccurred: false, gateOccurred: false, reviewMin: 6, recoveryMin: null }),
    buildCalibrationRecord(forecast(FIXTURES.repeatedFailure), {
      exceptionOccurred: true,
      gateOccurred: true,
      gateMin: 9,
      reviewMin: 14,
      recoveryMin: 22,
    }),
  ],
  summary: calibrationSummary([
    buildCalibrationRecord(fNormal, { exceptionOccurred: false, reviewMin: 6 }),
    buildCalibrationRecord(forecast(FIXTURES.repeatedFailure), {
      exceptionOccurred: true,
      gateOccurred: true,
      gateMin: 9,
      reviewMin: 14,
      recoveryMin: 22,
    }),
  ]),
};

const artifact = {
  generator: "proofrun/forecast",
  description: "Deterministic rules-first Intervention Forecast baseline (no model confidence, no API).",
  note: "Predicted and observed values are stored in separate fields; calibration metrics are null until enough matched samples exist.",
  examples,
  calibration,
};

writeFileSync(outPath, JSON.stringify(artifact, null, 2) + "\n", "utf8");
console.log(`wrote ${outPath}`);
