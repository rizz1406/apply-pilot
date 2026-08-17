import test from "node:test";
import assert from "node:assert/strict";
import { evaluateApplicationGate } from "../worker/quality-gate.js";

const settings = { tailoring_minimum_score: 75, must_have_skills: "SQL, BigQuery" };
const validJob = { title: "Data Analyst", score: 82, description: "Build BigQuery reporting and advanced SQL data models." };

test("allows a complete high-fit job with every required skill", () => {
  assert.deepEqual(evaluateApplicationGate(validJob, settings), { allowed: true });
});

test("blocks a job below the tailoring score", () => {
  const result = evaluateApplicationGate({ ...validJob, score: 74 }, settings);
  assert.equal(result.allowed, false);
  assert.match(result.error, /74%.*75%/);
});

test("blocks a job missing a required skill", () => {
  const result = evaluateApplicationGate({ ...validJob, description: "Build SQL reporting." }, settings);
  assert.equal(result.allowed, false);
  assert.match(result.error, /bigquery/);
});

test("blocks a job without a full description", () => {
  const result = evaluateApplicationGate({ ...validJob, description: "" }, settings);
  assert.equal(result.allowed, false);
  assert.match(result.error, /complete job description/);
});
