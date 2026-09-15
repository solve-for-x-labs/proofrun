import test from "node:test";
import assert from "node:assert/strict";
import { assessEvidence } from "../bin/readiness.mjs";

test("readiness blocks blank and missing runtime evidence", () => {
  const report = assessEvidence({ steps: [
    { id: "a", capture: "verified-real", screenshot: "a.png" },
    { id: "b", capture: "blank-capture", screenshot: "b.png" },
    { id: "c", capture: "none" }
  ] });
  assert.equal(report.approval, "REVIEW_REQUIRED");
  assert.equal(report.counts.LIVE_VERIFIED, 1);
  assert.equal(report.counts.LIVE_BLANK, 1);
  assert.equal(report.counts.NO_RUNTIME_MEDIA, 1);
});

test("readiness is approvable only when every step is live verified", () => {
  const report = assessEvidence({ steps: [
    { id: "a", capture: "verified-real", screenshot: "a.png" },
    { id: "b", capture: "verified-real", video: "run.mp4" }
  ] });
  assert.equal(report.approval, "APPROVABLE");
});
