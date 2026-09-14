import test from "node:test";
import assert from "node:assert/strict";
import { forecast } from "../src/index.ts";
test("repeated failures hard block", () => assert.equal(forecast({steps: 5, failures: 3, plannedGates: 1, changedFiles: 2, providerHealth: "healthy"}).recommendedMode, "HARD_BLOCK"));
test("healthy small task remains autonomous", () => assert.equal(forecast({steps: 5, failures: 0, plannedGates: 0, changedFiles: 1, providerHealth: "healthy"}).recommendedMode, "AUTO"));
test("unknown health is surfaced", () => assert.ok(forecast({steps: 2, failures: 0, plannedGates: 0, changedFiles: 1, providerHealth: "unknown"}).exceptionNextKSteps > 0.1));
