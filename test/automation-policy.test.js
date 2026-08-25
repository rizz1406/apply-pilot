import test from "node:test";
import assert from "node:assert/strict";
import { classifyApplication, providerCapability } from "../worker/automation-policy.js";

const settings = { automation_mode: "auto", auto_apply_min_score: 88, approval_min_score: 65 };
const job = { provider: "greenhouse", company: "Example", title: "Data Analyst", description: "SQL and BigQuery analytics", apply_url: "https://example.com/apply", score: 92 };

test("high-fit protected provider requires approval but is auto-prepared", () => {
  const result = classifyApplication(job, settings, {});
  assert.equal(result.action, "approval");
  assert.equal(result.autoPrepare, true);
  assert.equal(result.capability.submission, false);
});

test("candidate-capable connector allows automatic submission", () => {
  const result = classifyApplication({ ...job, provider: "recruitee" }, settings, { RECRUITEE_CANDIDATE_SUBMISSION_ENABLED: "true" });
  assert.equal(result.action, "auto_submit");
});

test("moderate match is sent for approval", () => {
  const result = classifyApplication({ ...job, score: 72 }, settings, {});
  assert.equal(result.action, "approval");
  assert.equal(result.autoPrepare, false);
});

test("weak, risky, incomplete, and blocked jobs are not submitted", () => {
  assert.equal(classifyApplication({ ...job, score: 40 }, settings, {}).action, "skip");
  assert.equal(classifyApplication({ ...job, description: "Pay a registration fee" }, settings, {}).action, "needs_input");
  assert.equal(classifyApplication({ ...job, description: "" }, settings, {}).action, "needs_input");
  assert.equal(classifyApplication(job, { ...settings, blocked_companies: "Example" }, {}).action, "skip");
});

test("provider capability is conservative by default", () => {
  assert.equal(providerCapability(job, {}).mode, "portal_handoff");
  assert.equal(providerCapability(job, {}).submission, false);
});
