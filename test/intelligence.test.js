import test from "node:test";
import assert from "node:assert/strict";
import { feedbackAdjustment, feedbackFeatures } from "../worker/preference-learning.js";
import { selectProjects } from "../worker/project-selector.js";
import { createInterviewPrep } from "../worker/application-tools.js";

test("learned preferences adjust matching without exceeding the guardrail", () => {
  const job = { provider: "greenhouse", company: "Acme", title: "Revenue Data Analyst" };
  assert.ok(feedbackFeatures(job).includes("title:revenue"));
  const result = feedbackAdjustment(job, { "provider:greenhouse": 6, "company:acme": 6, "title:revenue": 6 });
  assert.equal(result.adjustment, 12);
});

test("selects the most JD-relevant verified projects", () => {
  const selected = selectProjects(
    { title: "Data Engineer", description: "Build Python SQL ETL pipelines on GCP" },
    [
      { id: "1", evidence_type: "project", title: "ETL Monitor", context: "Python SQL GCP", bullets: "Built ETL monitoring", active: 1, verified: 1 },
      { id: "2", evidence_type: "project", title: "Excel Store", context: "Excel", bullets: "Sales dashboard", active: 1, verified: 1 }
    ], 1
  );
  assert.equal(selected[0].id, "1");
  assert.match(selected[0].reason, /Matches/);
});

test("interview prep includes a complete deterministic cockpit", () => {
  const prep = createInterviewPrep({ title: "Data Analyst", company: "Acme", description: "SQL BigQuery data quality" }, { title: "Data Analyst" });
  assert.equal(prep.questions.length, 5);
  assert.equal(prep.sqlPractice.length, 3);
  assert.equal(prep.starPrompts.length, 3);
  assert.equal(prep.plan306090.length, 3);
  assert.equal(prep.interviewerQuestions.length, 3);
});
