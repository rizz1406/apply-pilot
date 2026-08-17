import test from "node:test";
import assert from "node:assert/strict";
import { extractExperienceMinimum, extractSalaryMaximum, scoreJob, stripHtml } from "../worker/matching.js";

const settings = {
  target_role: "Software Engineer",
  alternate_titles: "Frontend Engineer,Full Stack Engineer",
  preferred_locations: "Remote,New York",
  required_skills: "JavaScript,TypeScript,React,Node.js",
  excluded_keywords: "unpaid,commission only"
};

test("scores a matching remote frontend role", () => {
  const result = scoreJob({
    title: "Frontend Engineer",
    description: "Build React applications using TypeScript and JavaScript.",
    location: "Remote - India",
    workplaceType: "remote"
  }, settings);
  assert.equal(result.eligible, true);
  assert.ok(result.score >= 80);
  assert.ok(result.reasons.some(reason => reason.includes("preferred skills")));
});

test("rejects excluded job text", () => {
  const result = scoreJob({
    title: "Software Engineer",
    description: "This is an unpaid opportunity.",
    location: "Remote"
  }, settings);
  assert.deepEqual(result, { score: 0, eligible: false, reasons: ["Contains an excluded keyword"] });
});

test("strips markup from ATS descriptions", () => {
  assert.equal(stripHtml("<p>Build &amp; ship</p><script>bad()</script>"), "Build & ship");
});

test("rejects seniority above the configured target", () => {
  const result = scoreJob({ title: "Senior Software Engineer", description: "React", location: "Remote" }, settings);
  assert.equal(result.eligible, false);
  assert.match(result.reasons[0], /Seniority/);
});

test("extracts the upper end of an Indian LPA range", () => {
  assert.equal(extractSalaryMaximum("₹7.5 - 10 LPA"), 1000000);
});

test("rejects a disclosed salary range below the minimum", () => {
  const result = scoreJob({ title: "Software Engineer", description: "React", location: "Remote", salaryText: "4 - 6 LPA" }, { ...settings, minimum_salary: 700000 });
  assert.equal(result.eligible, false);
  assert.match(result.reasons[0], /salary/);
});

test("extracts the minimum required experience", () => {
  assert.equal(extractExperienceMinimum("Requires 3-5 years of relevant experience"), 3);
});

test("rejects office roles outside the configured location", () => {
  const result = scoreJob({ title: "Software Engineer", description: "React", location: "Bengaluru, India", workplaceType: "on-site" }, settings);
  assert.equal(result.eligible, false);
  assert.match(result.reasons[0], /Location/);
});

test("accepts India remote roles", () => {
  const result = scoreJob({ title: "Software Engineer", description: "React", location: "India", workplaceType: "remote" }, settings);
  assert.equal(result.eligible, true);
});

test("honors a configurable minimum match score", () => {
  const result = scoreJob({ title: "Data Analyst", description: "SQL", location: "Hyderabad" }, {
    target_role: "Data Analyst", alternate_titles: "", required_skills: "SQL,BigQuery,Python,Power BI",
    preferred_locations: "Hyderabad,Remote India", excluded_keywords: "", minimum_match_score: 95
  });
  assert.equal(result.eligible, false);
  assert.equal(typeof result.dimensions.skills, "number");
});
