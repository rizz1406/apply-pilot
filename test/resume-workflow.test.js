import test from "node:test";
import assert from "node:assert/strict";
import { atsReadiness, checklistDefaults, mergeVerifiedEvidence, resumeDiff, validateRevisionInstruction } from "../worker/resume-workflow.js";

const profile = {
  name: "Rizwan", email: "r@example.com", phone: "123", linkedin: "https://linkedin.com/in/r",
  summary: "Data analyst with verified production reporting experience.", skills: "SQL, BigQuery",
  experience: [{ role: "Data Analyst", company: "DataBeat", bullets: ["Built SQL reports."] }],
  projects: [], certifications: []
};

test("merges only active verified resume evidence", () => {
  const rows = [
    { evidence_type: "project", title: "Pipeline", details_json: JSON.stringify({ tech: "Python", bullets: ["Built a verified API pipeline."] }), verified: 1, active: 1, source_url: "https://github.com/example/pipeline" },
    { evidence_type: "certification", title: "Unverified cert", details_json: "{}", verified: 0, active: 1 },
    { evidence_type: "skill", title: "dbt", details_json: JSON.stringify({ name: "dbt" }), verified: 1, active: 0 }
  ];
  const result = mergeVerifiedEvidence(profile, rows);
  assert.equal(result.projects.length, 1);
  assert.equal(result.projects[0].name, "Pipeline");
  assert.equal(result.certifications.length, 0);
  assert.doesNotMatch(result.skills, /dbt/);
});

test("adds verified achievements only to their named target", () => {
  const result = mergeVerifiedEvidence(profile, [{ evidence_type: "achievement", title: "QA", details_json: JSON.stringify({ targetType: "experience", targetName: "Data Analyst DataBeat", bullet: "Automated verified QA checks." }), verified: 1, active: 1 }]);
  assert.deepEqual(result.experience[0].bullets, ["Built SQL reports.", "Automated verified QA checks."]);
});

test("rejects revision prompts that request fabrication", () => {
  assert.equal(validateRevisionInstruction("Prioritize BigQuery experience"), "Prioritize BigQuery experience");
  assert.throws(() => validateRevisionInstruction("Invent a certification"), /unsupported claims/);
  assert.throws(() => validateRevisionInstruction("x".repeat(601)), /600/);
});

test("summarizes resume changes without losing version scores", () => {
  const diff = resumeDiff({ summary: "Old", skills: "SQL", matchScore: 70 }, { summary: "New", skills: "SQL", matchScore: 82 });
  assert.deepEqual(diff.changed, ["summary"]);
  assert.equal(diff.beforeScore, 70);
  assert.equal(diff.afterScore, 82);
});

test("reports ATS readiness from deterministic checks", () => {
  const resume = { ...profile, experienceStructured: profile.experience, projectsStructured: [], summary: "data ".repeat(260), skills: "SQL" };
  const result = atsReadiness(resume, { pct: 80 }, { verdict: "pass", qualityIssues: [], corrections: [] });
  assert.equal(result.score, 100);
  assert.equal(result.singleColumn, true);
  assert.equal(result.checks.length, 6);
});

test("creates a portal checklist with approval and follow-up controls", () => {
  const items = checklistDefaults("Ashby");
  assert.equal(items.length, 7);
  assert.match(items.find(item => item.item_key === "screening_answers").label, /Ashby/);
  assert.equal(items.find(item => item.item_key === "followup").required, 0);
});
