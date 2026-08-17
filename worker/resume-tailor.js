const SKILLS = ["sql","python","bigquery","snowflake","databricks","dbt","airflow","spark","etl","elt","data modeling","gcp","aws","azure","tableau","power bi","looker","looker studio","ga4","google analytics","google ad manager","gam","excel","google sheets","pandas","forecasting","statistics","a/b testing","docker","git","api","data quality","dashboard","reporting","partitioning","clustering","monitoring","alerting"];
const STRING = { type: "STRING" };
const STRINGS = { type: "ARRAY", items: STRING };
const ROLE = { type: "OBJECT", properties: { role: STRING, company: STRING, location: STRING, dates: STRING, bullets: STRINGS }, required: ["role", "company", "location", "dates", "bullets"] };
const PROJECT = { type: "OBJECT", properties: { name: STRING, tech: STRING, link: STRING, bullets: STRINGS }, required: ["name", "tech", "link", "bullets"] };
const EDUCATION = { type: "OBJECT", properties: { degree: STRING, school: STRING, location: STRING, dates: STRING }, required: ["degree", "school", "location", "dates"] };
const CERTIFICATION = { type: "OBJECT", properties: { name: STRING, link: STRING }, required: ["name", "link"] };
const TAILOR_SCHEMA = { type: "OBJECT", properties: {
  summary: STRING, skills: STRING, experienceStructured: { type: "ARRAY", items: ROLE }, projectsStructured: { type: "ARRAY", items: PROJECT }, educationStructured: { type: "ARRAY", items: EDUCATION }, certificationsStructured: { type: "ARRAY", items: CERTIFICATION },
  keywordsMatched: STRINGS, keywordsMissing: STRINGS, matchScore: { type: "INTEGER" }, scoreBreakdown: { type: "OBJECT", properties: { keywordMatch: { type: "INTEGER" }, experienceRelevance: { type: "INTEGER" }, seniorityFit: { type: "INTEGER" } }, required: ["keywordMatch", "experienceRelevance", "seniorityFit"] }, scoreRationale: STRING, improvements: STRINGS, fabricationWarnings: STRINGS, matchVerdict: { type: "STRING", enum: ["strong", "moderate", "weak"] }
}, required: ["summary", "skills", "experienceStructured", "projectsStructured", "educationStructured", "certificationsStructured", "keywordsMatched", "keywordsMissing", "matchScore", "scoreBreakdown", "scoreRationale", "improvements", "fabricationWarnings", "matchVerdict"] };
const AUDIT_SCHEMA = { type: "OBJECT", properties: { corrections: { type: "ARRAY", items: { type: "OBJECT", properties: { original: STRING, replacement: STRING, reason: STRING, sourceEvidence: STRING }, required: ["original", "replacement", "reason", "sourceEvidence"] } }, qualityIssues: STRINGS, verdict: { type: "STRING", enum: ["pass", "review"] } }, required: ["corrections", "qualityIssues", "verdict"] };

const text = value => typeof value === "string" ? value : "";
const strings = value => Array.isArray(value) ? value.filter(item => typeof item === "string").slice(0, 50) : [];
const rows = (value, map, max = 12) => Array.isArray(value) ? value.slice(0, max).map(map) : [];

function normalizeResume(raw, profile) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Tailoring returned an invalid resume");
  return {
    name: profile.name, title: profile.title, email: profile.email, phone: profile.phone,
    location: profile.location, linkedin: profile.linkedin, github: profile.github, website: profile.website,
    summary: text(raw.summary), skills: [...new Set(text(raw.skills).split(/[,;\n]+/).map(item => item.trim()).filter(Boolean))].join(", "),
    experienceStructured: rows(raw.experienceStructured, item => ({ role: text(item?.role), company: text(item?.company), location: text(item?.location), dates: text(item?.dates), bullets: strings(item?.bullets).slice(0, 6) })),
    projectsStructured: rows(raw.projectsStructured, item => ({ name: text(item?.name), tech: text(item?.tech), link: safeUrl(item?.link), bullets: strings(item?.bullets).slice(0, 5) })),
    educationStructured: rows(raw.educationStructured, item => ({ degree: text(item?.degree), school: text(item?.school), location: text(item?.location), dates: text(item?.dates) })),
    certificationsStructured: rows(raw.certificationsStructured, item => ({ name: text(item?.name), link: safeUrl(item?.link) })),
    keywordsMatched: strings(raw.keywordsMatched), keywordsMissing: strings(raw.keywordsMissing), improvements: strings(raw.improvements), fabricationWarnings: strings(raw.fabricationWarnings),
    matchScore: Math.max(0, Math.min(100, Math.round(Number(raw.matchScore) || 0))), scoreBreakdown: raw.scoreBreakdown || {}, scoreRationale: text(raw.scoreRationale), matchVerdict: ["strong","moderate","weak"].includes(raw.matchVerdict) ? raw.matchVerdict : "moderate"
  };
}

function safeUrl(value) {
  try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) ? url.href : ""; } catch { return ""; }
}

async function geminiJson(env, prompt, fast = false, schema = undefined) {
  if (!env.GEMINI_API_KEY) throw new Error("Gemini is not configured");
  const model = fast ? (env.GEMINI_FAST_MODEL || env.GEMINI_MODEL) : env.GEMINI_MODEL;
  const call = async input => {
    let response;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: input }] }], generationConfig: { responseMimeType: "application/json", responseSchema: schema, temperature: 0.1 } })
      });
      if (![429, 500, 502, 503, 504].includes(response.status) || attempt === 2) return response;
      await new Promise(resolve => setTimeout(resolve, 600 * (attempt + 1)));
    }
    return response;
  };
  const response = await call(prompt);
  if (!response.ok) throw new Error(`Gemini tailoring failed with ${response.status}`);
  const payload = await response.json();
  const raw = payload.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
  try { return JSON.parse(raw); }
  catch {
    const repaired = await call(`Repair the following malformed JSON. Preserve every value and return only strict valid JSON with no markdown.\n\n${raw}`);
    if (!repaired.ok) throw new Error("Gemini returned malformed JSON and repair failed");
    const repairedPayload = await repaired.json();
    return JSON.parse(repairedPayload.candidates?.[0]?.content?.parts?.[0]?.text || "{}");
  }
}

function resumeText(resume) {
  return [resume.summary, resume.skills, ...(resume.experienceStructured || []).flatMap(item => [item.role, item.company, ...(item.bullets || [])]), ...(resume.projectsStructured || []).flatMap(item => [item.name, item.tech, ...(item.bullets || [])])].filter(Boolean).join(" ").toLowerCase();
}

export function keywordCoverage(resume, jd) {
  const jdText = jd.toLowerCase();
  const relevant = SKILLS.filter(skill => jdText.includes(skill));
  if (!relevant.length) return { matched: [], missing: [], pct: null };
  const output = resumeText(resume);
  const matched = relevant.filter(skill => output.includes(skill));
  return { matched, missing: relevant.filter(skill => !matched.includes(skill)), pct: Math.round(matched.length / relevant.length * 100) };
}

function qualityChecks(resume) {
  const bullets = [...resume.experienceStructured, ...resume.projectsStructured].flatMap(item => item.bullets || []);
  const issues = [];
  if (bullets.some(item => /^(responsible for|helped|worked on|assisted with)/i.test(item))) issues.push("One or more bullets use weak opening language.");
  if (bullets.some(item => item.split(/\s+/).length > 32)) issues.push("One or more bullets exceed 32 words.");
  if (resume.summary.split(/\s+/).length > 55) issues.push("Summary exceeds 55 words.");
  if (resume.skills.split(",").filter(Boolean).length > 24) issues.push("Skills section may be keyword-stuffed.");
  return issues;
}

function applyCorrections(resume, corrections) {
  const fix = value => (corrections || []).reduce((current, item) => item.original && current.includes(item.original) ? current.replace(item.original, item.replacement || "").trim() : current, text(value));
  return { ...resume, summary: fix(resume.summary), skills: fix(resume.skills), experienceStructured: resume.experienceStructured.map(item => ({ ...item, bullets: item.bullets.map(fix).filter(Boolean) })), projectsStructured: resume.projectsStructured.map(item => ({ ...item, bullets: item.bullets.map(fix).filter(Boolean) })) };
}

export async function createTailoredPack(env, profile, job) {
  const { email, phone, linkedin, github, website, ...evidenceProfile } = profile;
  const prompt = `Create a one-page ATS-safe resume for this job. Use ONLY facts explicitly present in MASTER PROFILE. You may rephrase, reorder, condense and omit. Never add or inflate skills, tools, employers, titles, dates, projects, certifications or metrics. Missing JD keywords must remain missing. Return JSON with summary, skills, experienceStructured, projectsStructured, educationStructured, certificationsStructured, keywordsMatched, keywordsMissing, matchScore, scoreBreakdown, scoreRationale, improvements, fabricationWarnings, matchVerdict.\nMASTER PROFILE:\n${JSON.stringify(evidenceProfile)}\nJOB DESCRIPTION:\n${job.description.slice(0, 20000)}`;
  let resume = normalizeResume(await geminiJson(env, prompt, false, TAILOR_SCHEMA), profile);
  const auditPrompt = `Fact-check every claim in GENERATED RESUME against MASTER PROFILE. Return JSON: {"corrections":[{"original":"exact unsupported text","replacement":"truthful grounded replacement","reason":"reason","sourceEvidence":"evidence"}],"qualityIssues":["issue"],"verdict":"pass or review"}. Do not assume facts. Contact fields are added locally and must not be audited.\nMASTER PROFILE:\n${JSON.stringify(evidenceProfile)}\nGENERATED RESUME CONTENT:\n${JSON.stringify({ ...resume, email: undefined, phone: undefined, linkedin: undefined, github: undefined, website: undefined })}`;
  const audit = await geminiJson(env, auditPrompt, true, AUDIT_SCHEMA);
  const corrections = Array.isArray(audit.corrections) ? audit.corrections.filter(item => item?.original && item?.reason).slice(0, 20) : [];
  resume = applyCorrections(resume, corrections);
  const coverage = keywordCoverage(resume, job.description);
  const issues = [...new Set([...(Array.isArray(audit.qualityIssues) ? audit.qualityIssues : []), ...qualityChecks(resume)])];
  const finalAudit = { ...audit, corrections, qualityIssues: issues, autoCorrected: corrections.length, verdict: corrections.length || issues.length ? "review" : "pass" };
  return { resume, audit: finalAudit, coverage, latex: buildLatex(resume), status: finalAudit.verdict === "pass" ? "audit_pass" : "review", model: env.GEMINI_MODEL };
}

const latexEscape = value => text(value).replace(/([#$%&_{}])/g, "\\$1").replace(/~/g, "\\textasciitilde{}").replace(/\^/g, "\\textasciicircum{}");
export function buildLatex(resume) {
  const bullets = items => (items || []).map(item => `\\item ${latexEscape(item)}`).join("\n");
  const experience = resume.experienceStructured.map(item => `\\textbf{${latexEscape(item.role)}} \\hfill ${latexEscape(item.dates)}\\\\\n${latexEscape(item.company)} -- ${latexEscape(item.location)}\n\\begin{itemize}\n${bullets(item.bullets)}\n\\end{itemize}`).join("\n");
  const projects = resume.projectsStructured.map(item => `\\textbf{${latexEscape(item.name)}} (${latexEscape(item.tech)})\n\\begin{itemize}\n${bullets(item.bullets)}\n\\end{itemize}`).join("\n");
  return `\\documentclass[10pt]{article}\n\\usepackage[margin=0.55in]{geometry}\n\\usepackage[hidelinks]{hyperref}\n\\setlength{\\parindent}{0pt}\n\\begin{document}\n\\begin{center}{\\LARGE \\textbf{${latexEscape(resume.name)}}}\\\\${latexEscape(resume.title)}\\\\${latexEscape(resume.email)} $|$ ${latexEscape(resume.phone)} $|$ ${latexEscape(resume.location)}\\end{center}\n\\section*{Summary}\n${latexEscape(resume.summary)}\n\\section*{Skills}\n${latexEscape(resume.skills)}\n\\section*{Experience}\n${experience}\n\\section*{Projects}\n${projects}\n\\end{document}`;
}

export async function contentHash(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}
