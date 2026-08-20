const parseDetails = value => {
  if (value && typeof value === "object") return value;
  try { return JSON.parse(value || "{}"); } catch { return {}; }
};

const list = value => Array.isArray(value) ? value.filter(Boolean) : [];
const key = value => String(value || "").trim().toLowerCase();

export function validateRevisionInstruction(value) {
  const instruction = String(value || "").trim();
  if (!instruction) return "";
  if (instruction.length > 600) throw new Error("Revision instructions must be 600 characters or fewer");
  if (/\b(invent|fabricate|fake|lie|make up|claim without)\b/i.test(instruction)) throw new Error("Instructions cannot request unsupported claims");
  return instruction;
}

export function mergeVerifiedEvidence(profile, rows = []) {
  const merged = structuredClone(profile || {});
  merged.experience = list(merged.experience);
  merged.projects = list(merged.projects);
  merged.certifications = list(merged.certifications);
  merged.skillsStructured = list(merged.skillsStructured);
  const skillNames = String(merged.skills || "").split(/[,;\n]+/).map(value => value.trim()).filter(Boolean);

  for (const row of rows.filter(item => Number(item.verified) === 1 && Number(item.active) !== 0)) {
    const details = parseDetails(row.details_json ?? row.details);
    if (row.evidence_type === "experience") {
      const entry = { role: details.role || row.title, company: details.company || "", location: details.location || "", dates: details.dates || "", bullets: list(details.bullets) };
      if (entry.company && !merged.experience.some(item => key(item.role) === key(entry.role) && key(item.company) === key(entry.company))) merged.experience.push(entry);
    }
    if (row.evidence_type === "project") {
      const entry = { name: details.name || row.title, tech: details.tech || "", date: details.date || "", link: details.link || row.source_url || "", bullets: list(details.bullets), verifiedSource: row.source_url || "user-confirmed" };
      if (!merged.projects.some(item => key(item.name) === key(entry.name))) merged.projects.push(entry);
    }
    if (row.evidence_type === "certification") {
      const entry = { name: details.name || row.title, link: details.link || row.source_url || "", date: details.date || "" };
      if (!merged.certifications.some(item => key(typeof item === "string" ? item : item.name) === key(entry.name))) merged.certifications.push(entry);
    }
    if (row.evidence_type === "skill") {
      const name = details.name || row.title;
      if (name && !skillNames.some(item => key(item) === key(name))) skillNames.push(name);
      if (details.category && details.details && !merged.skillsStructured.some(item => key(item.category) === key(details.category) && key(item.details).includes(key(details.details)))) merged.skillsStructured.push({ category: details.category, details: details.details });
    }
    if (row.evidence_type === "achievement") {
      const collection = details.targetType === "project" ? merged.projects : merged.experience;
      const target = collection.find(item => key(item.name || `${item.role} ${item.company}`).includes(key(details.targetName)));
      if (target && details.bullet) {
        target.bullets = list(target.bullets);
        if (!target.bullets.some(item => key(item) === key(details.bullet))) target.bullets.push(details.bullet);
      }
    }
  }
  merged.skills = skillNames.join(", ");
  return merged;
}

const sectionText = value => JSON.stringify(value || []);

export function resumeDiff(before = {}, after = {}) {
  const fields = ["summary", "skills", "experienceStructured", "projectsStructured", "educationStructured", "certificationsStructured"];
  const changed = fields.filter(field => sectionText(before[field]) !== sectionText(after[field]));
  return {
    changed,
    beforeScore: Number(before.matchScore || 0),
    afterScore: Number(after.matchScore || 0),
    summary: changed.length ? `Updated ${changed.map(field => field.replace("Structured", "")).join(", ")}.` : "No factual content changed; relevance ordering was retained."
  };
}

export function atsReadiness(resume = {}, coverage = {}, audit = {}) {
  const words = [resume.summary, resume.skills, ...list(resume.experienceStructured).flatMap(item => item.bullets || []), ...list(resume.projectsStructured).flatMap(item => item.bullets || [])].join(" ").trim().split(/\s+/).filter(Boolean).length;
  const checks = [
    { key: "contact", label: "Contact details and profile links", pass: Boolean(resume.email && resume.phone && resume.linkedin) },
    { key: "headings", label: "Standard ATS section headings", pass: true },
    { key: "evidence", label: "Experience contains verified bullets", pass: list(resume.experienceStructured).length > 0 && list(resume.experienceStructured).every(item => list(item.bullets).length > 0) },
    { key: "truth", label: "Truth audit has no unresolved issues", pass: audit.verdict === "pass" || (!list(audit.qualityIssues).length && !list(audit.corrections).length) },
    { key: "keywords", label: "JD keyword coverage is at least 60%", pass: coverage.pct == null || Number(coverage.pct) >= 60 },
    { key: "length", label: "Resume content length is ATS-readable", pass: words >= 250 && words <= 900 }
  ];
  return { score: Math.round(checks.filter(item => item.pass).length / checks.length * 100), checks, wordCount: words, singleColumn: true };
}

export const checklistDefaults = provider => [
  ["jd_reviewed", "Full job description reviewed", 1],
  ["resume_tailored", "Tailored resume generated and audited", 1],
  ["resume_approved", "Resume approved", 1],
  ["screening_answers", `${provider || "Portal"} screening answers reviewed`, 1],
  ["submitted", "Official application submitted", 1],
  ["confirmation", "Submission confirmation received", 0],
  ["followup", "Recruiter follow-up scheduled", 0]
].map(([item_key, label, required]) => ({ item_key, label, required }));
