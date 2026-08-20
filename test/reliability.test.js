import test from "node:test";
import assert from "node:assert/strict";
import { validateAccessClaims } from "../worker/access-auth.js";
import { runMatchingEvaluation } from "../worker/evaluation.js";
import { fetchSourceWithRetry } from "../worker/discovery.js";

test("Cloudflare Access claims enforce audience and expiry", () => {
  const env = { ACCESS_AUD: "applypilot-aud", ACCESS_TEAM_DOMAIN: "example.cloudflareaccess.com" };
  const identity = validateAccessClaims({ aud: ["applypilot-aud"], exp: Math.floor(Date.now() / 1000) + 60, iss: "https://example.cloudflareaccess.com", email: "user@example.com" }, env);
  assert.equal(identity.email, "user@example.com");
  assert.throws(() => validateAccessClaims({ aud: "wrong", exp: Math.floor(Date.now() / 1000) + 60 }, env), /audience/);
  assert.throws(() => validateAccessClaims({ aud: "applypilot-aud", exp: 1 }, env), /expired/);
});

test("matching evaluation reports a bounded reproducible score", () => {
  const result = runMatchingEvaluation({
    target_role: "Data Analyst", alternate_titles: "BI Analyst,Junior Data Engineer", internship_titles: "Data Analyst Intern",
    preferred_locations: "Hyderabad,Remote India", required_skills: "SQL,BigQuery,Power BI,Python,ETL,GCP", excluded_keywords: "commission",
    minimum_match_score: 50, experience_tolerance_years: 1, candidate_years: 2
  });
  assert.equal(result.total, 6);
  assert.ok(result.accuracy >= 50 && result.accuracy <= 100);
  assert.equal(result.details.length, 6);
});

test("source fetch retries transient failures and then succeeds", async () => {
  let calls = 0;
  const result = await fetchSourceWithRetry({ provider: "test" }, 3, async () => {
    calls += 1;
    if (calls < 3) throw new Error("temporary");
    return [{ id: "job" }];
  });
  assert.equal(result.attempts, 3);
  assert.equal(result.jobs.length, 1);
});

test("source fetch stops after the configured retry bound", async () => {
  await assert.rejects(fetchSourceWithRetry({}, 2, async () => { throw new Error("down"); }), error => error.message === "down" && error.attempts === 2);
});
