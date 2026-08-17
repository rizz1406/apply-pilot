import test from "node:test";
import assert from "node:assert/strict";
import { buildLatex, contentHash, createTailoredPack, keywordCoverage } from "../worker/resume-tailor.js";

const resume = {
  name: "Rizwan Baig", title: "Data Analyst", email: "test@example.com", phone: "123", location: "Hyderabad",
  summary: "Analyst building reporting workflows with SQL and BigQuery.", skills: "SQL, BigQuery, Power BI",
  experienceStructured: [{ role: "Data Analyst", company: "Acme", location: "Hyderabad", dates: "2025 - Present", bullets: ["Built SQL reporting pipelines."] }],
  projectsStructured: [], educationStructured: [], certificationsStructured: []
};

test("computes deterministic JD keyword coverage", () => {
  const result = keywordCoverage(resume, "Requires SQL, BigQuery, Power BI and Airflow experience");
  assert.equal(result.pct, 75);
  assert.deepEqual(result.missing, ["airflow"]);
});

test("creates ATS-safe LaTeX and escapes special characters", () => {
  const latex = buildLatex({ ...resume, summary: "Revenue & cost analysis" });
  assert.match(latex, /Revenue \\& cost/);
  assert.match(latex, /\\section\*\{Experience\}/);
});

test("creates stable content hashes", async () => {
  assert.equal(await contentHash("same JD"), await contentHash("same JD"));
  assert.notEqual(await contentHash("same JD"), await contentHash("changed JD"));
});

test("audits and corrects an unsupported generated claim", async () => {
  const originalFetch = globalThis.fetch;
  const responses = [
    { summary: "Expert analyst", skills: "SQL", experienceStructured: [{ role: "Data Analyst", company: "Acme", bullets: ["Built SQL reports"] }], projectsStructured: [], educationStructured: [], certificationsStructured: [], matchScore: 80, matchVerdict: "strong" },
    { corrections: [{ original: "Expert analyst", replacement: "Data analyst", reason: "Expert is unsupported", sourceEvidence: "Data Analyst" }], qualityIssues: [], verdict: "review" }
  ];
  globalThis.fetch = async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(responses.shift()) }] } }] }));
  try {
    const pack = await createTailoredPack({ GEMINI_API_KEY: "key", GEMINI_MODEL: "gemini-test" }, { name: "Rizwan", title: "Data Analyst", skills: "SQL" }, { description: "SQL reporting", title: "Data Analyst", company: "Acme" });
    assert.equal(pack.resume.summary, "Data analyst");
    assert.equal(pack.audit.autoCorrected, 1);
    assert.equal(pack.status, "review");
  } finally { globalThis.fetch = originalFetch; }
});
