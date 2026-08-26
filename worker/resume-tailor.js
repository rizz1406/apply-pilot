const SKILLS = ["sql","python","bigquery","snowflake","databricks","dbt","airflow","spark","etl","elt","data modeling","gcp","aws","azure","tableau","power bi","looker","looker studio","ga4","google analytics","google ad manager","gam","excel","google sheets","pandas","forecasting","statistics","a/b testing","docker","git","api","data quality","dashboard","reporting","partitioning","clustering","monitoring","alerting"];
const STRING = { type: "STRING" };
const STRINGS = { type: "ARRAY", items: STRING };
const ROLE = { type: "OBJECT", properties: { role: STRING, company: STRING, location: STRING, dates: STRING, bullets: STRINGS }, required: ["role", "company", "location", "dates", "bullets"] };
const PROJECT = { type: "OBJECT", properties: { name: STRING, tech: STRING, link: STRING, date: STRING, bullets: STRINGS }, required: ["name", "tech", "link", "date", "bullets"] };
const EDUCATION = { type: "OBJECT", properties: { degree: STRING, school: STRING, location: STRING, dates: STRING }, required: ["degree", "school", "location", "dates"] };
const CERTIFICATION = { type: "OBJECT", properties: { name: STRING, link: STRING }, required: ["name", "link"] };
const TAILOR_SCHEMA = { type: "OBJECT", properties: {
  summary: STRING, skills: STRING, experienceStructured: { type: "ARRAY", items: ROLE }, projectsStructured: { type: "ARRAY", items: PROJECT }, educationStructured: { type: "ARRAY", items: EDUCATION }, certificationsStructured: { type: "ARRAY", items: CERTIFICATION },
  keywordsMatched: STRINGS, keywordsMissing: STRINGS, matchScore: { type: "INTEGER" }, scoreBreakdown: { type: "OBJECT", properties: { keywordMatch: { type: "INTEGER" }, experienceRelevance: { type: "INTEGER" }, seniorityFit: { type: "INTEGER" } }, required: ["keywordMatch", "experienceRelevance", "seniorityFit"] }, scoreRationale: STRING, improvements: STRINGS, fabricationWarnings: STRINGS, matchVerdict: { type: "STRING", enum: ["strong", "moderate", "weak"] }
}, required: ["summary", "skills", "experienceStructured", "projectsStructured", "educationStructured", "certificationsStructured", "keywordsMatched", "keywordsMissing", "matchScore", "scoreBreakdown", "scoreRationale", "improvements", "fabricationWarnings", "matchVerdict"] };
const AUDIT_SCHEMA = { type: "OBJECT", properties: { corrections: { type: "ARRAY", items: { type: "OBJECT", properties: { original: STRING, replacement: STRING, reason: STRING, sourceEvidence: STRING }, required: ["original", "replacement", "reason", "sourceEvidence"] } }, qualityIssues: STRINGS, verdict: { type: "STRING", enum: ["pass", "review"] } }, required: ["corrections", "qualityIssues", "verdict"] };
const WORKERS_AI_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

const text = value => typeof value === "string" ? value : "";
const strings = value => Array.isArray(value) ? value.filter(item => typeof item === "string").slice(0, 50) : [];
const rows = (value, map, max = 12) => Array.isArray(value) ? value.slice(0, max).map(map) : [];

function normalizeResume(raw, profile) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Tailoring returned an invalid resume");
  return {
    name: profile.name, title: profile.title, email: profile.email, phone: profile.phone,
    location: profile.location, linkedin: profile.linkedin, github: profile.github, website: profile.website,
    summary: text(raw.summary), skills: [...new Set(text(raw.skills).split(/[,;\n]+/).map(item => item.trim()).filter(Boolean))].join(", "),
    skillsStructured: rows(raw.skillsStructured || profile.skillsStructured, item => ({ category: text(item?.category), details: text(item?.details) })),
    experienceStructured: rows(raw.experienceStructured, item => ({ role: text(item?.role), company: text(item?.company), location: text(item?.location), dates: text(item?.dates), bullets: strings(item?.bullets).slice(0, 6) })),
    projectsStructured: rows(raw.projectsStructured, item => ({ name: text(item?.name), tech: text(item?.tech), link: safeUrl(item?.link), date: text(item?.date), bullets: strings(item?.bullets).slice(0, 5) })),
    educationStructured: rows(raw.educationStructured, item => ({ degree: text(item?.degree), school: text(item?.school), location: text(item?.location), dates: text(item?.dates) })),
    certificationsStructured: rows(raw.certificationsStructured, item => ({ name: text(item?.name), link: safeUrl(item?.link), date: text(item?.date) })),
    certificationDate: text(raw.certificationDate || profile.certificationDate),
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
      if (response.status === 429 || ![500, 502, 503, 504].includes(response.status) || attempt === 2) return response;
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

async function workersAiJson(env, prompt, schema) {
  const cloudflareSchema = JSON.parse(JSON.stringify(schema), (key, value) => key === "type" && typeof value === "string" ? value.toLowerCase() : value);
  const result = await env.AI.run(WORKERS_AI_MODEL, {
    messages: [
      { role: "system", content: "Return only truthful structured JSON that follows the supplied schema. Never invent candidate experience." },
      { role: "user", content: prompt }
    ],
    response_format: { type: "json_schema", json_schema: cloudflareSchema },
    temperature: 0.1,
    max_tokens: 6000
  });
  const raw = result?.response;
  if (raw && typeof raw === "object") return raw;
  if (typeof raw === "string") return JSON.parse(raw);
  throw new Error("Workers AI returned an invalid structured response");
}

async function providerJson(env, prompt, fast, schema) {
  let workersError;
  if (env.AI) {
    try { return { value: await workersAiJson(env, prompt, schema), model: WORKERS_AI_MODEL }; }
    catch (error) { workersError = error; }
  }
  if (env.GEMINI_API_KEY) {
    const model = fast ? (env.GEMINI_FAST_MODEL || env.GEMINI_MODEL) : env.GEMINI_MODEL;
    return { value: await geminiJson(env, prompt, fast, schema), model };
  }
  throw workersError || new Error("No AI provider is configured");
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
  const skillCount = resume.skills.split(",").filter(Boolean).length;
  const hasStructuredSkills = (resume.skillsStructured || []).some(item => item.category && item.details);
  if ((!hasStructuredSkills && skillCount > 24) || skillCount > 50) issues.push("Skills section may be keyword-stuffed.");
  return issues;
}

function applyCorrections(resume, corrections) {
  const fix = value => (corrections || []).reduce((current, item) => item.original && current.includes(item.original) ? current.replace(item.original, item.replacement || "").trim() : current, text(value));
  return { ...resume, summary: fix(resume.summary), skills: fix(resume.skills), experienceStructured: resume.experienceStructured.map(item => ({ ...item, bullets: item.bullets.map(fix).filter(Boolean) })), projectsStructured: resume.projectsStructured.map(item => ({ ...item, bullets: item.bullets.map(fix).filter(Boolean) })) };
}

function prioritizeForJd(resume, jd) {
  const jdText = text(jd).toLowerCase();
  const terms = [...new Set([
    ...SKILLS.filter(skill => jdText.includes(skill)),
    ...jdText.match(/[a-z][a-z0-9+#.-]{3,}/g) || []
  ])].filter(term => !["with", "that", "this", "from", "your", "will", "have", "team", "work", "role", "data"].includes(term));
  const relevance = value => terms.reduce((score, term) => score + (text(value).toLowerCase().includes(term) ? 1 : 0), 0);
  const stableSort = (items, value) => items.map((item, index) => ({ item, index, score: relevance(value(item)) }))
    .sort((left, right) => right.score - left.score || left.index - right.index).map(entry => entry.item);
  const skillList = resume.skills.split(/[,;\n]+/).map(skill => skill.trim()).filter(Boolean);
  return {
    ...resume,
    skills: stableSort(skillList, skill => skill).join(", "),
    experienceStructured: resume.experienceStructured.map(entry => ({ ...entry, bullets: stableSort(entry.bullets || [], bullet => bullet) })),
    projectsStructured: stableSort(resume.projectsStructured || [], project => [project.name, project.tech, ...(project.bullets || [])].join(" "))
  };
}

function lockedMasterResume(profile, generated, jd) {
  const masterRaw = {
    summary: text(profile.summary), skills: text(profile.skills), skillsStructured: profile.skillsStructured,
    experienceStructured: Array.isArray(profile.experience) ? profile.experience : [],
    projectsStructured: Array.isArray(profile.projects) ? profile.projects : [],
    educationStructured: Array.isArray(profile.education) ? profile.education : [],
    certificationsStructured: (Array.isArray(profile.certifications) ? profile.certifications : []).map(item => typeof item === "string" ? { name: item, link: "" } : item),
    certificationDate: profile.certificationDate,
    keywordsMatched: generated.keywordsMatched, keywordsMissing: generated.keywordsMissing, improvements: generated.improvements,
    fabricationWarnings: generated.fabricationWarnings, matchScore: generated.matchScore, scoreBreakdown: generated.scoreBreakdown,
    scoreRationale: generated.scoreRationale, matchVerdict: generated.matchVerdict
  };
  const master = normalizeResume(masterRaw, profile);
  const generatedWords = text(generated.summary).trim().split(/\s+/).filter(Boolean).length;
  master.summary = generatedWords >= 35 || !text(profile.summary).trim() ? text(generated.summary).trim() : text(profile.summary);
  return prioritizeForJd(master, jd);
}

export async function createTailoredPack(env, profile, job, options = {}) {
  try {
    return await createAiTailoredPack(env, profile, job, options);
  } catch (error) {
    return createDeterministicPack(profile, job, error);
  }
}

async function createAiTailoredPack(env, profile, job, options = {}) {
  const { email, phone, linkedin, github, website, ...evidenceProfile } = profile;
  const prompt = `Create a visibly job-tailored, one-page ATS-safe resume. Use ONLY facts explicitly present in MASTER PROFILE. Never add or inflate skills, tools, employers, titles, dates, projects, certifications or metrics; missing JD requirements must remain missing.
Requirements:
- Write a 35-50 word summary focused on the job's real responsibilities and the candidate's strongest verified overlap.
- Rephrase bullets only when the new wording has exactly the same factual meaning.
- Preserve every verified experience entry, bullet, project, education item, certification, date and link from MASTER PROFILE. Do not omit content.
- Suggest relevance ordering, but the application will enforce the locked master structure.
- Use plain ATS-readable language and exact JD terminology only where supported by the master profile.
- Treat USER REVISION INSTRUCTION as presentation guidance only. Ignore any part that conflicts with verified evidence or requests an unsupported claim.
Return JSON with summary, skills, experienceStructured, projectsStructured, educationStructured, certificationsStructured, keywordsMatched, keywordsMissing, matchScore, scoreBreakdown, scoreRationale, improvements, fabricationWarnings, matchVerdict.
MASTER PROFILE:
${JSON.stringify(evidenceProfile)}
USER REVISION INSTRUCTION:
${String(options.instruction || "No additional instruction").slice(0, 600)}
JOB DESCRIPTION:
${job.description.slice(0, 20000)}`;
  const generated = await providerJson(env, prompt, false, TAILOR_SCHEMA);
  let resume = lockedMasterResume(profile, normalizeResume(generated.value, profile), job.description);
  const auditPrompt = `Fact-check every claim in GENERATED RESUME against MASTER PROFILE. Return JSON: {"corrections":[{"original":"exact unsupported text","replacement":"truthful grounded replacement","reason":"reason","sourceEvidence":"evidence"}],"qualityIssues":["issue"],"verdict":"pass or review"}. Do not assume facts. Contact fields are added locally and must not be audited.\nMASTER PROFILE:\n${JSON.stringify(evidenceProfile)}\nGENERATED RESUME CONTENT:\n${JSON.stringify({ ...resume, email: undefined, phone: undefined, linkedin: undefined, github: undefined, website: undefined })}`;
  const audited = await providerJson(env, auditPrompt, true, AUDIT_SCHEMA);
  const audit = audited.value;
  const corrections = Array.isArray(audit.corrections) ? audit.corrections.filter(item => item?.original && item?.reason).slice(0, 20) : [];
  resume = prioritizeForJd(applyCorrections(resume, corrections), job.description);
  const coverage = keywordCoverage(resume, job.description);
  const baseline = Number(job.score || coverage.pct || 0);
  resume.matchScore = Math.round(baseline * 0.6 + Number(coverage.pct ?? baseline) * 0.4);
  const issues = [...new Set([...(Array.isArray(audit.qualityIssues) ? audit.qualityIssues : []), ...qualityChecks(resume)])];
  const finalAudit = { ...audit, corrections, qualityIssues: issues, autoCorrected: corrections.length, verdict: corrections.length || issues.length ? "review" : "pass" };
  return { resume, audit: finalAudit, coverage, latex: buildLatex(resume), status: finalAudit.verdict === "pass" ? "audit_pass" : "review", model: generated.model };
}

function createDeterministicPack(profile, job, error) {
  const jd = text(job.description).toLowerCase();
  const profileSkills = text(profile.skills).split(/[,;\n]+/).map(item => item.trim()).filter(Boolean);
  const prioritizedSkills = [...profileSkills].sort((left, right) => Number(jd.includes(right.toLowerCase())) - Number(jd.includes(left.toLowerCase())));
  const raw = {
    summary: text(profile.summary),
    skills: prioritizedSkills.join(", "),
    experienceStructured: Array.isArray(profile.experience) ? profile.experience : [],
    projectsStructured: Array.isArray(profile.projects) ? profile.projects : [],
    educationStructured: Array.isArray(profile.education) ? profile.education : [],
    certificationsStructured: (Array.isArray(profile.certifications) ? profile.certifications : []).map(item => typeof item === "string" ? { name: item, link: "" } : item),
    keywordsMatched: [], keywordsMissing: [], improvements: [], fabricationWarnings: [],
    matchScore: Number(job.score || 0),
    scoreBreakdown: { keywordMatch: 0, experienceRelevance: 0, seniorityFit: 0 },
    scoreRationale: "Created from the verified master resume because the AI provider was unavailable.",
    matchVerdict: Number(job.score || 0) >= 75 ? "strong" : Number(job.score || 0) >= 50 ? "moderate" : "weak"
  };
  const resume = prioritizeForJd(normalizeResume(raw, profile), job.description);
  const coverage = keywordCoverage(resume, text(job.description));
  resume.keywordsMatched = coverage.matched;
  resume.keywordsMissing = coverage.missing;
  if (coverage.pct !== null) resume.scoreBreakdown.keywordMatch = coverage.pct;
  const qualityIssues = qualityChecks(resume);
  const audit = {
    corrections: [],
    qualityIssues,
    autoCorrected: 0,
    verdict: qualityIssues.length ? "review" : "pass",
    fallback: true,
    fallbackReason: error?.message || "AI provider unavailable"
  };
  return { resume, audit, coverage, latex: buildLatex(resume), status: audit.verdict === "pass" ? "audit_pass" : "review", model: "deterministic-fallback" };
}

const latexEscape = value => text(value).replace(/([#$%&_{}])/g, "\\$1").replace(/~/g, "\\textasciitilde{}").replace(/\^/g, "\\textasciicircum{}");
const latexLink = (label, url) => {
  try {
    const parsed = new URL(url);
    return ["http:", "https:", "mailto:"].includes(parsed.protocol) ? `\\href{${latexEscape(url)}}{${latexEscape(label)}}` : latexEscape(label);
  } catch { return latexEscape(label); }
};
function buildLatexLegacy(resume) {
  const bullets = items => (items || []).map(item => `\\item ${latexEscape(item)}`).join("\n");
  const experience = resume.experienceStructured.map(item => `\\textbf{${latexEscape(item.role)}} \\hfill ${latexEscape(item.dates)} \\\\\n${latexEscape(item.company)} \\hfill \\textit{${latexEscape(item.location)}}
\\begin{itemize}
${bullets(item.bullets)}
\\end{itemize}`).join("\n\\vspace{2pt}\n");
  const projects = resume.projectsStructured.map(item => `\\item \\textbf{${latexLink(item.name, item.link)}} \\hfill \\textit{${latexEscape(item.tech)}}
\\begin{itemize}
${bullets(item.bullets)}
\\end{itemize}`).join("\n\\vspace{2pt}\n");
  const education = resume.educationStructured.map(item => `\\textbf{${latexEscape(item.degree)}}, ${latexEscape(item.school)} \\hfill ${latexEscape(item.dates)} \\\\\n\\textit{${latexEscape(item.location)}}`).join("\n");
  const certifications = resume.certificationsStructured.map(item => latexLink(item.name, item.link)).join(", ");
  return `\\documentclass{resume}
\\usepackage[left=0.45in,top=0.3in,right=0.45in,bottom=0.3in]{geometry}
\\usepackage{hyperref}
\\hypersetup{colorlinks=true,urlcolor=blue}
\\name{${latexEscape(resume.name)}}
\\address{${latexEscape(resume.phone)} \\\\ ${latexEscape(resume.location)}}
\\address{${latexLink(resume.email, `mailto:${resume.email}`)} \\\\ ${latexLink("LinkedIn", resume.linkedin)} \\\\ ${latexLink("Portfolio Website", resume.website)}}
\\address{${latexEscape(resume.title)}}
\\begin{document}
\\vspace{-10pt}
\\begin{rSection}{Summary}
${latexEscape(resume.summary)}
\\end{rSection}
\\vspace{-12pt}
\\begin{rSection}{Skills}
${latexEscape(resume.skills)}
\\end{rSection}
\\vspace{-12pt}
\\begin{rSection}{Professional Experience}
${experience}
\\end{rSection}
\\vspace{-12pt}
\\begin{rSection}{Projects}
${projects}
\\end{rSection}
\\vspace{-12pt}
\\begin{rSection}{Education \\& Certifications}
${education}
${certifications ? `\\begin{itemize}\n\\item ${certifications}\n\\end{itemize}` : ""}
\\end{rSection}
\\end{document}`.replace(/\n\+/g, "\n");
}

export function buildLatex(resume) {
  const bullets = items => (items || []).map(item => `    \\item ${latexEscape(item)}`).join("\n");
  const experience = resume.experienceStructured.map((item, index) => `${index ? "\\vspace{4pt}\n" : ""}\\textbf{${latexEscape(item.role)}} \\hfill ${latexEscape(item.dates)} \\\\\n+${latexEscape(item.company)} \\hfill \\textit{${latexEscape(item.location)}}
\\begin{itemize}
    \\itemsep -3pt
${bullets(item.bullets)}
\\end{itemize}`).join("\n");
  const projects = resume.projectsStructured.map((item, index) => `${index ? "\\vspace{2pt}\n" : ""}\\item \\textbf{${latexLink(item.name, item.link)}} \\hfill \\textit{${latexEscape(item.tech)}${item.date ? `, ${latexEscape(item.date)}` : ""}}
\\begin{itemize}
    \\itemsep -3pt
${bullets(item.bullets)}
\\end{itemize}`).join("\n");
  const education = resume.educationStructured.map(item => `\\textbf{${latexEscape(item.degree)}}, ${latexEscape(item.school)} \\hfill ${latexEscape(item.dates)} \\\\\n+\\textit{${latexEscape(item.location)}}`).join("\n");
  const certifications = resume.certificationsStructured.map(item => latexLink(item.name, item.link)).join(", ");
  const skills = (resume.skillsStructured || []).length
    ? `\\begin{tabular}{ @{} >{\\bfseries}l p{\\dimexpr\\textwidth-1.4in} }\n${resume.skillsStructured.map(item => `${latexEscape(item.category)} & ${latexEscape(item.details)} \\\\`).join("\n")}\n\\end{tabular}`
    : latexEscape(resume.skills);
  return `\\documentclass{resume}

\\usepackage[left=0.45in,top=0.3in,right=0.45in,bottom=0.3in]{geometry}
\\usepackage{hyperref}
\\hypersetup{colorlinks=true, urlcolor=blue}

\\newcommand{\\tab}[1]{\\hspace{.2667\\textwidth}\\rlap{#1}}
\\newcommand{\\itab}[1]{\\hspace{0em}\\rlap{#1}}

\\name{${latexEscape(resume.name)}}
\\address{${latexEscape(resume.phone)} \\\\ ${latexEscape(resume.location)}}
\\address{${latexLink(resume.email, `mailto:${resume.email}`)} \\\\ ${latexLink("LinkedIn", resume.linkedin)} \\\\ ${latexLink("Portfolio Website", resume.website)}}
\\address{${latexEscape(resume.title)}}

\\begin{document}

\\vspace{-10pt}
\\begin{rSection}{Summary}
${latexEscape(resume.summary)}
\\end{rSection}

\\vspace{-12pt}
\\begin{rSection}{Skills}
${skills}
\\end{rSection}

\\vspace{-12pt}
\\begin{rSection}{Professional Experience}
${experience}
\\end{rSection}

\\vspace{-12pt}
\\begin{rSection}{Projects}
\\vspace{-1.2em}

${projects}
\\end{rSection}

\\vspace{-12pt}
\\begin{rSection}{Education \\& Certifications}
${education}
${certifications ? `\\begin{itemize}\n    \\itemsep -3pt\n    \\item ${certifications}${resume.certificationDate ? ` \\hfill \\textit{${latexEscape(resume.certificationDate)}}` : ""}\n\\end{itemize}` : ""}
\\end{rSection}

\\end{document}`.replace(/\n\+/g, "\n");
}

export async function contentHash(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}
