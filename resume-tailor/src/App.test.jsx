import { describe, expect, it } from "vitest";
import { applyEvidenceCorrections, computeKeywordCoverage, normalizeProfile, normalizeSkills, normalizeTailoredResult, parseResumeTextLocally, rankProjectsByRelevance, runResumeQualityChecks, safeWebUrl } from "./App.jsx";
import { buildResumeDocxBlob } from "./docxExport.js";

describe("safeWebUrl", () => {
  it("normalizes normal web links", () => expect(safeWebUrl("github.com/example")).toBe("https://github.com/example"));
  it("rejects script and malformed links", () => {
    expect(safeWebUrl("javascript:alert(1)")).toBe("");
    expect(safeWebUrl('http://example.com\" onclick=\"alert(1)')).toBe("");
  });
});

describe("normalizeTailoredResult", () => {
  it("bounds scores, arrays, and unsafe AI links", () => {
    const result = normalizeTailoredResult({
      summary: "Summary", skills: "SQL", matchScore: 140, matchVerdict: "unknown",
      experienceStructured: [{ role: "Analyst", bullets: ["Built reports", 7] }],
      projectsStructured: [{ name: "Demo", link: "javascript:alert(1)", bullets: [] }],
    });
    expect(result.matchScore).toBe(100);
    expect(result.matchVerdict).toBe("moderate");
    expect(result.experienceStructured[0].bullets).toEqual(["Built reports"]);
    expect(result.projectsStructured[0].link).toBe("");
  });
});

describe("normalizeProfile", () => {
  it("turns malformed AI fields into safe form values", () => {
    const profile = normalizeProfile({ name: { unexpected: true }, email: null, skills: ["SQL"], experience: "Real experience" }, "Test");
    expect(profile).toMatchObject({ name: "", email: "", skills: "", experience: "Real experience", _label: "Test" });
  });
  it("removes a legacy website hallucinated from the email local-part", () => {
    expect(normalizeProfile({ email: "jordan.lee@example.com", website: "jordan.lee" }).website).toBe("");
  });
});

describe("local text resume parsing", () => {
  it("extracts a structured text resume without an API call", () => {
    const profile = parseResumeTextLocally("Jordan Lee\nData Analyst\njordan@example.com | +1 555-123-4567 | Raleigh, NC\n\nSUMMARY\nData analyst with 4 years of experience.\n\nSKILLS\nSQL, Python\n\nEXPERIENCE\nData Analyst — Acme\n- Built reports");
    expect(profile).toMatchObject({ name: "Jordan Lee", title: "Data Analyst", email: "jordan@example.com", location: "Raleigh, NC", summary: "Data analyst with 4 years of experience.", skills: "SQL, Python" });
    expect(profile.experience).toContain("Built reports");
    expect(profile.website).toBe("");
  });
});

describe("project relevance", () => {
  it("puts the job-relevant project first without changing project content", () => {
    const projects = [{ name: "Churn", tech: "Python" }, { name: "BI Dashboard", tech: "Power BI, SQL" }];
    expect(rankProjectsByRelevance(projects, "Build Power BI dashboards with SQL")[0].name).toBe("BI Dashboard");
  });
});

describe("evidence-backed correction", () => {
  it("replaces only exact unsupported text and preserves the rest", () => {
    const input = { summary: "Analyst writing advanced SQL", skills: "SQL", experienceStructured: [], projectsStructured: [] };
    const result = applyEvidenceCorrections(input, [{ original: "advanced SQL", replacement: "SQL" }]);
    expect(result.applied).toBe(1);
    expect(result.resume.summary).toBe("Analyst writing SQL");
  });
});

describe("resume quality checks", () => {
  it("flags weak and overly long bullets", () => {
    const issues = runResumeQualityChecks({ summary: "Short", skills: "SQL", experienceStructured: [{ bullets: ["Responsible for " + "very ".repeat(35) + "long reporting work"] }], projectsStructured: [] });
    expect(issues.join(" ")).toMatch(/weak phrasing|longer than 32 words/);
  });
});

describe("DOCX export", () => {
  it("creates a non-empty OOXML zip", async () => {
    const blob = await buildResumeDocxBlob({ name: "Jordan Lee", title: "Data Analyst", email: "jordan@example.com", summary: "Analyst", skills: "SQL, Python", experienceStructured: [{ role: "Analyst", company: "Acme", dates: "2022–Present", bullets: ["Built reports."] }] });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(String.fromCharCode(bytes[0], bytes[1])).toBe("PK");
    expect(bytes.length).toBeGreaterThan(1000);
  });
});

describe("ATS skill formatting", () => {
  it("normalizes bullets, semicolons, duplicates, and newlines to commas", () => {
    expect(normalizeSkills("SQL; Python\nPower BI, SQL")).toBe("SQL, Python, Power BI");
  });
});

describe("keyword coverage", () => {
  it("returns reproducible matches for a job", () => {
    const result = computeKeywordCoverage({ skills: "Python, SQL, AWS" }, "We need Python, SQL, AWS, Docker and Kubernetes experience.");
    expect(result.pct).toBe(60);
    expect(result.missing).toEqual(expect.arrayContaining(["docker", "kubernetes"]));
  });
});
