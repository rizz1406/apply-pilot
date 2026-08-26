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
  assert.match(latex, /\\documentclass\{resume\}/);
  assert.match(latex, /\\begin\{rSection\}\{Professional Experience\}/);
  assert.doesNotMatch(latex, /^\+/m);
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

test("creates a truthful resume pack when Gemini quota is unavailable", async () => {
  const profile = {
    name: "Rizwan Baig", title: "Data Analyst", email: "test@example.com", phone: "123", location: "Hyderabad",
    summary: "Data Analyst building reporting workflows.", skills: "BigQuery, SQL, Power BI",
    experience: [{ role: "Data Analyst", company: "DataBeat", location: "Hyderabad", dates: "2025 - Present", bullets: ["Built SQL reporting pipelines."] }],
    projects: [], education: [], certifications: ["Data Analytics Essentials"]
  };
  const pack = await createTailoredPack({}, profile, { title: "Data Analyst", company: "Acme", description: "Requires SQL and BigQuery", score: 76 });
  assert.equal(pack.model, "deterministic-fallback");
  assert.equal(pack.audit.fallback, true);
  assert.equal(pack.audit.verdict, "pass");
  assert.equal(pack.status, "audit_pass");
  assert.equal(pack.resume.experienceStructured[0].company, "DataBeat");
  assert.deepEqual(pack.coverage.missing, []);
  assert.match(pack.latex, /DataBeat/);
});

test("does not flag a verified categorized skills table as keyword stuffing", async () => {
  const skills = Array.from({ length: 30 }, (_, index) => `Verified Skill ${index + 1}`).join(", ");
  const profile = {
    name: "Rizwan Baig", title: "Data Analyst", email: "test@example.com", phone: "123", location: "Hyderabad",
    summary: "Data Analyst building reporting workflows with verified production experience.", skills,
    skillsStructured: [
      { category: "Databases & SQL", details: "BigQuery, SQL, window functions, CTEs" },
      { category: "Programming", details: "Python, API integration, QA automation" }
    ],
    experience: [{ role: "Data Analyst", company: "DataBeat", location: "Hyderabad", dates: "2025 - Present", bullets: ["Built SQL reporting pipelines."] }],
    projects: [], education: [], certifications: []
  };
  const pack = await createTailoredPack({}, profile, { title: "Data Analyst", company: "Acme", description: "Requires SQL and BigQuery", score: 80 });
  assert.equal(pack.audit.verdict, "pass");
  assert.doesNotMatch(pack.audit.qualityIssues.join(" "), /keyword-stuffed/i);
});

test("falls back immediately after one Gemini 429 response", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; return new Response("quota exhausted", { status: 429 }); };
  try {
    const profile = { ...resume, experience: resume.experienceStructured, projects: [], education: [], certifications: [] };
    const pack = await createTailoredPack({ GEMINI_API_KEY: "key", GEMINI_MODEL: "gemini-test" }, profile, { title: "Data Analyst", company: "Acme", description: "SQL and BigQuery", score: 76 });
    assert.equal(calls, 1);
    assert.equal(pack.model, "deterministic-fallback");
  } finally { globalThis.fetch = originalFetch; }
});

test("uses Cloudflare Workers AI structured output before Gemini", async () => {
  const outputs = [
    { summary: "SQL analyst for revenue reporting", skills: "SQL, BigQuery", experienceStructured: resume.experienceStructured, projectsStructured: [], educationStructured: [], certificationsStructured: [], keywordsMatched: ["sql", "bigquery"], keywordsMissing: [], matchScore: 84, scoreBreakdown: { keywordMatch: 100, experienceRelevance: 80, seniorityFit: 90 }, scoreRationale: "Relevant reporting work", improvements: [], fabricationWarnings: [], matchVerdict: "strong" },
    { corrections: [], qualityIssues: [], verdict: "pass" }
  ];
  let calls = 0;
  const env = { AI: { run: async (_model, input) => { calls += 1; assert.equal(input.response_format.json_schema.type, "object"); return { response: outputs.shift() }; } }, GEMINI_API_KEY: "unused" };
  const profile = { ...resume, experience: resume.experienceStructured, projects: [], education: [], certifications: [] };
  const pack = await createTailoredPack(env, profile, { title: "Revenue Data Analyst", company: "Acme", description: "SQL and BigQuery revenue reporting", score: 84 });
  assert.equal(calls, 2);
  assert.equal(pack.model, "@cf/meta/llama-3.3-70b-instruct-fp8-fast");
  assert.equal(pack.resume.summary, resume.summary);
});

test("prioritizes verified JD evidence without deleting projects", async () => {
  const generated = {
    summary: "Analyst with verified SQL reporting experience.", skills: "Excel, BigQuery, SQL",
    experienceStructured: [{ ...resume.experienceStructured[0], bullets: ["Maintained weekly spreadsheets.", "Built BigQuery SQL reporting pipelines."] }],
    projectsStructured: [
      { name: "Excel tracker", tech: "Excel", link: "", bullets: ["Tracked sales."] },
      { name: "SQL warehouse", tech: "SQL, BigQuery", link: "", bullets: ["Built reporting tables."] },
      { name: "Power BI report", tech: "Power BI", link: "", bullets: ["Built a dashboard."] }
    ],
    educationStructured: [], certificationsStructured: [], keywordsMatched: [], keywordsMissing: [], matchScore: 80,
    scoreBreakdown: { keywordMatch: 0, experienceRelevance: 0, seniorityFit: 0 }, scoreRationale: "Verified overlap", improvements: [], fabricationWarnings: [], matchVerdict: "strong"
  };
  const outputs = [generated, { corrections: [], qualityIssues: [], verdict: "pass" }];
  const env = { AI: { run: async () => ({ response: outputs.shift() }) } };
  const profile = { ...resume, experience: resume.experienceStructured, projects: generated.projectsStructured, education: [], certifications: [] };
  const pack = await createTailoredPack(env, profile, { title: "BigQuery Analyst", company: "Acme", description: "Build BigQuery SQL pipelines", score: 80 });
  assert.match(pack.resume.skills, /^SQL, BigQuery/);
  assert.equal(pack.resume.experienceStructured[0].bullets[0], "Built SQL reporting pipelines.");
  assert.equal(pack.resume.projectsStructured.length, 3);
  assert.equal(pack.resume.projectsStructured[0].name, "SQL warehouse");
});

test("locks every verified master section when AI omits content", async () => {
  const profile = {
    ...resume,
    summary: "Data Analyst with production experience building and owning analytics reporting, BigQuery datasets, ETL pipelines, dashboards, automated reporting, data quality checks, and optimized SQL workflows for a major digital media client.",
    skills: "SQL, BigQuery, GA4, Python",
    skillsStructured: [{ category: "Databases & SQL", details: "BigQuery, advanced SQL" }],
    experience: [resume.experienceStructured[0], { role: "Research Intern", company: "College", location: "Remote", dates: "2024 - 2025", bullets: ["Validated educational data."] }],
    projects: [{ name: "One", tech: "SQL", link: "https://example.com/one", date: "Dec 2024", bullets: ["Built one."] }, { name: "Two", tech: "Excel", link: "https://example.com/two", date: "Feb 2024", bullets: ["Built two."] }],
    education: [{ degree: "B.Tech", school: "College", location: "Hyderabad", dates: "2021 - 2025" }],
    certifications: [{ name: "Cert A", link: "https://example.com/a" }, { name: "Cert B", link: "https://example.com/b" }, { name: "Cert C", link: "https://example.com/c" }],
    certificationDate: "Feb 2025"
  };
  const generated = { summary: "Short summary.", skills: "SQL", experienceStructured: [], projectsStructured: [], educationStructured: [], certificationsStructured: [], keywordsMatched: [], keywordsMissing: [], matchScore: 70, scoreBreakdown: { keywordMatch: 0, experienceRelevance: 0, seniorityFit: 0 }, scoreRationale: "", improvements: [], fabricationWarnings: [], matchVerdict: "moderate" };
  const outputs = [generated, { corrections: [], qualityIssues: [], verdict: "pass" }];
  const pack = await createTailoredPack({ AI: { run: async () => ({ response: outputs.shift() }) } }, profile, { title: "Data Analyst", company: "Acme", description: "SQL BigQuery", score: 70 });
  assert.equal(pack.resume.summary, profile.summary);
  assert.equal(pack.resume.experienceStructured.length, 2);
  assert.equal(pack.resume.projectsStructured.length, 2);
  assert.equal(pack.resume.certificationsStructured.length, 3);
  assert.equal(pack.resume.skillsStructured.length, 1);
  assert.match(pack.latex, /\\begin\{tabular\}/);
  assert.match(pack.latex, /\\itemsep -3pt/);
  assert.match(pack.latex, /Cert C/);
});
