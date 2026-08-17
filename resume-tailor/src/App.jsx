import React, { useState, useRef, useEffect } from "react";
import "./App.css";
 
// ─── Persistence (localStorage) ─────────────────────────────────────────────
const LS_KEY = "resumeTailor.apiKey"; // legacy/opt-in persistent key
const LS_PROFILE = "resumeTailor.myProfile";     // legacy single profile (migrated)
const LS_PROFILES = "resumeTailor.profiles";     // { id: {name,...profile fields, _label} }
const LS_ACTIVE = "resumeTailor.activeProfile";  // id of the currently selected profile
const LS_HISTORY = "resumeTailor.history";
const LS_APPLICATIONS = "resumeTailor.applications";
const loadLS = (k, fb) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch { return fb; } };
const saveLS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
 
const DEFAULT_PROFILE = {
  name: "", title: "", email: "", phone: "", location: "",
  linkedin: "", github: "", website: "",
  summary: "", skills: "", experience: "", projects: "", education: "", certifications: "",
};
export function normalizeProfile(value, label = "My profile") {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const normalized = Object.fromEntries(Object.keys(DEFAULT_PROFILE).map((key) => [key, asString(source[key])]));
  const emailLocal = normalized.email.split("@")[0]?.toLowerCase();
  const websiteHost = normalized.website.replace(/^https?:\/\//i, "").replace(/\/$/, "").toLowerCase();
  if (emailLocal && websiteHost === emailLocal) normalized.website = "";
  return { ...normalized, _label: asString(source._label) || label };
}
export function parseResumeTextLocally(text) {
  const raw = String(text || "").replace(/\r/g, "").trim();
  const lines = raw.split("\n").map((line) => line.trim()).filter(Boolean);
  const headings = new Set(["SUMMARY", "SKILLS", "EXPERIENCE", "PROJECTS", "EDUCATION", "CERTIFICATIONS"]);
  const sections = {}; let current = "HEADER";
  for (const line of lines) {
    const upper = line.toUpperCase().replace(/:$/, "");
    if (headings.has(upper)) { current = upper; sections[current] = []; }
    else (sections[current] ||= []).push(line);
  }
  const header = sections.HEADER || [];
  const joined = header.join(" | ");
  const contactTokens = header.flatMap((line) => line.split("|")).map((token) => token.trim()).filter(Boolean);
  const links = header.flatMap((line) => line.split("|")).map((token) => token.trim()).filter((token) => !token.includes("@") && /^(?:https?:\/\/)?(?:www\.)?[a-z0-9.-]+\.[a-z]{2,}(?:\/\S*)?$/i.test(token));
  const findLink = (host) => links.find((link) => link.toLowerCase().includes(host)) || "";
  return normalizeProfile({
    name: header[0] || "", title: header[1] || "",
    email: joined.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || "",
    phone: joined.match(/(?:\+?\d[\d ().-]{7,}\d)/)?.[0]?.trim() || "",
    location: contactTokens.find((token) => token.includes(",") && !/@|https?:|linkedin|github/i.test(token) && !/\d{3}[- )]/.test(token)) || "",
    linkedin: findLink("linkedin.com"), github: findLink("github.com"),
    website: links.find((link) => !/linkedin\.com|github\.com/i.test(link) && !joined.includes(`@${link}`)) || "",
    summary: (sections.SUMMARY || []).join("\n"), skills: (sections.SKILLS || []).join(", "),
    experience: (sections.EXPERIENCE || []).join("\n"), projects: (sections.PROJECTS || []).join("\n"),
    education: (sections.EDUCATION || []).join("\n"), certifications: (sections.CERTIFICATIONS || []).join("\n"),
  });
}
 
// Load the named-profile collection, migrating any legacy single profile on first run.
function loadProfiles() {
  const existing = loadLS(LS_PROFILES, null);
  if (existing && typeof existing === "object" && !Array.isArray(existing) && Object.keys(existing).length) {
    return Object.fromEntries(Object.entries(existing).filter(([, value]) => value && typeof value === "object").map(([id, value]) => [id, normalizeProfile(value)]));
  }
  const legacy = loadLS(LS_PROFILE, null);
  const id = uid();
  const seed = legacy && (legacy.name || legacy.experience)
    ? { [id]: { ...DEFAULT_PROFILE, ...legacy, _label: legacy.title || "My profile" } }
    : { [id]: { ...DEFAULT_PROFILE, _label: "My profile" } };
  return seed;
}
 
// ─── LaTeX (with per-item links) ─────────────────────────────────────────────
function esc(s = "") {
  return String(s)
    .replace(/\\/g, "\\textbackslash{}").replace(/&/g, "\\&").replace(/%/g, "\\%")
    .replace(/\$/g, "\\$").replace(/#/g, "\\#").replace(/_/g, "\\_")
    .replace(/\{/g, "\\{").replace(/\}/g, "\\}")
    .replace(/~/g, "\\textasciitilde{}").replace(/\^/g, "\\textasciicircum{}");
}
export function safeWebUrl(value = "") {
  const raw = String(value).trim();
  if (!raw) return "";
  try {
    const parsed = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.href : "";
  } catch { return ""; }
}
const urlize = safeWebUrl;
const displayWebUrl = (value) => safeWebUrl(value).replace(/^https?:\/\//i, "").replace(/\/$/, "");
 
function buildLatex(r) {
  const contactBits = [
    r.email && `\\href{mailto:${esc(r.email)}}{${esc(r.email)}}`,
    r.phone && esc(r.phone),
    r.location && esc(r.location),
    safeWebUrl(r.linkedin) && `\\href{${esc(safeWebUrl(r.linkedin))}}{${esc(displayWebUrl(r.linkedin))}}`,
    safeWebUrl(r.github) && `\\href{${esc(safeWebUrl(r.github))}}{${esc(displayWebUrl(r.github))}}`,
    safeWebUrl(r.website) && `\\href{${esc(safeWebUrl(r.website))}}{${esc(displayWebUrl(r.website))}}`,
  ].filter(Boolean);
  const bulletList = (items) => items && items.length
    ? `\\begin{itemize}[leftmargin=1.2em, itemsep=1pt, topsep=2pt, parsep=0pt]\n${items.map((b) => `  \\item ${esc(b)}`).join("\n")}\n\\end{itemize}` : "";
  const expBody = (r.experienceStructured || []).map((e) =>
    `\\textbf{${esc(e.role || "")}} \\hfill ${esc(e.dates || "")}\\\\\n\\textit{${esc(e.company || "")}${e.location ? ", " + esc(e.location) : ""}}\n` + bulletList(e.bullets)
  ).join("\n\\vspace{4pt}\n");
  const projBody = (r.projectsStructured || []).map((p) => {
    const nameLatex = p.link ? `\\href{${esc(urlize(p.link))}}{${esc(p.name || "")}}` : `\\textbf{${esc(p.name || "")}}`;
    const nm = p.link ? `\\textbf{${nameLatex}}` : nameLatex;
    return `${nm}${p.tech ? " \\textnormal{\\small(" + esc(p.tech) + ")}" : ""}\n` + bulletList(p.bullets);
  }).join("\n\\vspace{3pt}\n");
  const eduBody = (r.educationStructured || []).map((ed) =>
    `\\textbf{${esc(ed.degree || "")}} \\hfill ${esc(ed.dates || "")}\\\\\n\\textit{${esc(ed.school || "")}${ed.location ? ", " + esc(ed.location) : ""}}`
  ).join("\\\\[3pt]\n");
  const certBody = (r.certificationsStructured || []).length
    ? r.certificationsStructured.map((c) => c.link ? `\\href{${esc(urlize(c.link))}}{${esc(c.name || "")}}` : esc(c.name || "")).join("\\\\[2pt]\n")
    : (r.certifications ? esc(r.certifications) : "");
  const plain = (title, body) => body && body.trim() ? `\\section{${esc(title)}}\n${esc(body)}\n` : "";
  return `\\documentclass[11pt,letterpaper]{article}
\\usepackage[margin=0.65in]{geometry}
\\usepackage{enumitem}
\\usepackage[hidelinks]{hyperref}
\\input{glyphtounicode}
\\pdfgentounicode=1
\\pagestyle{empty}
\\renewcommand{\\section}[1]{\\vspace{6pt}\\noindent\\textbf{\\large #1}\\vspace{2pt}\\hrule\\vspace{4pt}}
\\setlength{\\parindent}{0pt}
\\begin{document}
\\begin{center}
  {\\LARGE \\textbf{${esc(r.name || "Your Name")}}}\\\\[2pt]
  ${r.title ? `{\\large ${esc(r.title)}}\\\\[3pt]` : ""}
  ${contactBits.join(" $\\bullet$ ")}
\\end{center}
\\vspace{4pt}
${plain("Summary", r.summary)}
${plain("Skills", r.skills)}
${expBody ? `\\section{Experience}\n${expBody}\n` : ""}
${projBody ? `\\section{Projects}\n${projBody}\n` : ""}
${eduBody ? `\\section{Education}\n${eduBody}\n` : ""}
${certBody ? `\\section{Certifications}\n${certBody}\n` : ""}
\\end{document}`;
}
 
// ─── Gemini ──────────────────────────────────────────────────────────────────
const GEMINI_MODEL = import.meta.env.VITE_GEMINI_MODEL || "gemini-3.5-flash";
const GEMINI_FAST_MODEL = import.meta.env.VITE_GEMINI_FAST_MODEL || "gemini-3.5-flash-lite";
const GEMINI_FALLBACK_MODEL = import.meta.env.VITE_GEMINI_FALLBACK_MODEL || "gemini-3.1-flash-lite";
const geminiURL = (model) => `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
async function geminiCall(key, parts, generationConfig, model = GEMINI_MODEL) {
  const body = { contents: [{ role: "user", parts }] };
  if (generationConfig) body.generationConfig = generationConfig;
  const maxAttempts = 4;
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 60000);
    let res;
    try {
      const requestBody = JSON.stringify(body);
      const useRelay = location.hostname.endsWith("vercel.app") && requestBody.length < 3_000_000;
      res = await fetch(useRelay ? "/api/gemini" : geminiURL(model), {
        method: "POST",
        headers: useRelay
          ? { "Content-Type": "application/json", "x-gemini-key": key, "x-gemini-model": model }
          : { "Content-Type": "application/json", "x-goog-api-key": key },
        body: requestBody,
        signal: ctrl.signal,
      });
    } catch (e) {
      clearTimeout(timer);
      if (e.name === "AbortError") throw new Error("Request timed out — try again.");
      lastErr = new Error("Network error — check your connection and retry.");
      if (attempt < maxAttempts) { await new Promise((r) => setTimeout(r, 800 * attempt)); continue; }
      throw lastErr;
    }
    clearTimeout(timer);
    if (!res.ok) {
      const t = await res.text();
      if (res.status === 400 && /API key not valid/i.test(t)) throw new Error("Invalid API key.");
      if (res.status === 404 && model !== GEMINI_FALLBACK_MODEL) return geminiCall(key, parts, generationConfig, GEMINI_FALLBACK_MODEL);
      if (res.status === 404) throw new Error("Gemini models are temporarily unavailable for this API key.");
      // Transient — Google overloaded or rate-limiting. Back off and retry.
      if ((res.status === 503 || res.status === 429 || res.status === 500) && attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 1200 * attempt)); // 1.2s, 2.4s, 3.6s
        continue;
      }
      if (res.status === 503) throw new Error("Gemini is overloaded right now (Google's side). Wait a moment and try again.");
      if (res.status === 429) throw new Error("Rate limit reached — wait a minute and retry.");
      throw new Error(`Gemini error ${res.status}: ${t.slice(0, 120)}`);
    }
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
    if (!text) throw new Error("Empty response from Gemini.");
    return text;
  }
  throw lastErr || new Error("Gemini request failed after retries.");
}
const stripJson = (t) => t.replace(/```json/gi, "").replace(/```/g, "").trim();
function safeParse(t, ctx) {
  try { return JSON.parse(stripJson(t)); }
  catch { throw new Error(`${ctx}: the AI returned invalid JSON. Try again.`); }
}
const asString = (v) => typeof v === "string" ? v : "";
const asStrings = (v) => Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, 50) : [];
export const normalizeSkills = (value) => [...new Set(asString(value).split(/[,;\n•]+/).map((skill) => skill.trim()).filter(Boolean))].join(", ");
const clampScore = (v) => Number.isFinite(Number(v)) ? Math.max(0, Math.min(100, Math.round(Number(v)))) : null;
export function normalizeTailoredResult(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Resume tailoring: incomplete AI response. Try again.");
  const rows = (key, mapper, max = 12) => Array.isArray(raw[key]) ? raw[key].slice(0, max).map(mapper) : [];
  return {
    ...raw,
    summary: asString(raw.summary), skills: normalizeSkills(raw.skills),
    experienceStructured: rows("experienceStructured", (e = {}) => ({ role: asString(e.role), company: asString(e.company), location: asString(e.location), dates: asString(e.dates), bullets: asStrings(e.bullets).slice(0, 6) })),
    projectsStructured: rows("projectsStructured", (p = {}) => ({ name: asString(p.name), tech: asString(p.tech), link: safeWebUrl(p.link), bullets: asStrings(p.bullets).slice(0, 5) })),
    educationStructured: rows("educationStructured", (e = {}) => ({ degree: asString(e.degree), school: asString(e.school), location: asString(e.location), dates: asString(e.dates) })),
    certificationsStructured: rows("certificationsStructured", (c = {}) => ({ name: asString(c.name), link: safeWebUrl(c.link) })),
    keywordsMatched: asStrings(raw.keywordsMatched), keywordsMissing: asStrings(raw.keywordsMissing),
    improvements: asStrings(raw.improvements), fabricationWarnings: asStrings(raw.fabricationWarnings),
    matchScore: clampScore(raw.matchScore),
    matchVerdict: ["strong", "moderate", "weak"].includes(raw.matchVerdict) ? raw.matchVerdict : "moderate",
  };
}
// Minimal-thinking + JSON mode for cheap, fast, parseable extraction calls.
const JSON_CFG = { responseMimeType: "application/json" };
const TAILOR_CFG = { responseMimeType: "application/json", thinkingConfig: { thinkingLevel: "low" } };
const FAST_JSON_CFG = { responseMimeType: "application/json", thinkingConfig: { thinkingLevel: "minimal" } };
const FAST_CFG = { thinkingConfig: { thinkingLevel: "minimal" } };
const AUDIT_CFG = {
  responseMimeType: "application/json",
  thinkingConfig: { thinkingLevel: "minimal" },
  responseSchema: {
    type: "OBJECT",
    properties: {
      corrections: { type: "ARRAY", items: { type: "OBJECT", properties: { original: { type: "STRING" }, replacement: { type: "STRING" }, reason: { type: "STRING" }, sourceEvidence: { type: "STRING" } }, required: ["original", "replacement", "reason", "sourceEvidence"] } },
      qualityIssues: { type: "ARRAY", items: { type: "STRING" } },
      verdict: { type: "STRING", enum: ["pass", "review"] },
    },
    required: ["corrections", "qualityIssues", "verdict"],
  },
};
 
async function extractJDFromImage(key, base64, mimeType) {
  return geminiCall(key, [{ inline_data: { mime_type: mimeType, data: base64 } }, { text: "Extract the full job description text from this screenshot. Return only the raw text, no commentary." }], FAST_CFG, GEMINI_FAST_MODEL);
}
async function extractJDFromImages(key, images) {
  // images: [{ data, mimeType }] — multiple screenshots of ONE posting (scrolled).
  const parts = images.map((img) => ({ inline_data: { mime_type: img.mimeType, data: img.data } }));
  parts.push({ text: `These ${images.length} screenshots are parts of ONE job posting, in order (e.g. a long page scrolled top to bottom). Stitch them into a single continuous job description. Remove duplicated/overlapping text where the screenshots overlap. Return only the raw job description text, no commentary.` });
  return geminiCall(key, parts, FAST_CFG, GEMINI_FAST_MODEL);
}
async function parseResumeToProfile(key, text) {
  const prompt = `Extract this resume text into a structured profile. Copy contact details (name, email, phone, links) EXACTLY as they appear in the text — never reformat, complete, or "professionalize" an email or any contact field. If a field is absent, leave it as an empty string. Return ONLY valid JSON (no markdown):
{"name":"","title":"","email":"","phone":"","location":"","linkedin":"","github":"","website":"","skills":"comma separated","experience":"free text of roles/companies/dates/bullets","projects":"free text","education":"free text","certifications":"comma separated"}
 
RESUME TEXT:
${text}`;
  return safeParse(await geminiCall(key, [{ text: prompt }], FAST_JSON_CFG, GEMINI_FAST_MODEL), "Resume parsing");
}
async function tailorResume(key, profile, jd, customPrompt = "") {
  const prompt = `You are an expert ATS resume writer. Given a candidate's raw profile and a target job description, produce a tailored, ATS-friendly resume. Rewrite experience/project bullets to emphasize achievements and keywords relevant to the job (strong action verbs). Reorder skills so the most job-relevant come first.
 
TRUTHFULNESS LOCK (absolute — this resume is for a REAL job application the candidate will be interviewed on):
- You may ONLY rephrase, reorder, condense, and re-emphasize information that is present in the candidate profile below. 
- NEVER add a skill, tool, technology, employer, title, date, degree, certification, project, or metric that is not explicitly in the profile.
- NEVER invent or inflate numbers. Keep a metric ONLY if the profile states it. Do not turn "improved performance" into "improved performance by 30%".
- If a job keyword is missing from the candidate's background, LEAVE IT MISSING — list it in keywordsMissing, do not slip it into a bullet.
- If you are ever unsure whether something is grounded, leave it out and note it in fabricationWarnings.
- Every single bullet in the output must be defensible in an interview using only the source profile.
 
HARD CONSTRAINTS (must obey):
- ONE PAGE ONLY. The final resume MUST fit on a single US-letter page at 11pt. Be ruthless: keep the summary to 2 lines, cap each role at 3-4 bullets, drop the least-relevant roles/projects entirely if needed, and keep bullets to roughly one line each. Prefer fewer, stronger, high-impact bullets over completeness.
- Plain ATS-safe content only: no tables, no columns, no graphics, standard section names.
- Prioritize strictly by relevance to the job description; cut anything that doesn't earn its space.
- Keep the Skills section as a clean comma-separated list, never bullets, prose, ratings, or keyword stuffing.
- Use bullets for achievements under Experience and Projects. Start each with a strong verb, keep it concise, and preserve every stated metric exactly.
- Never estimate or recalculate years of experience. If the profile states a number of years, repeat that exact number or omit years entirely.
- Never upgrade proficiency with adjectives such as "advanced", "expert", "deep", or "extensive" unless that exact level is explicitly supported by the profile.
- Keep matchVerdictReason factual and professional. Never speculate that a hiring manager will "bend" requirements, mentor the candidate into a title, or make an exception.
 
For projects and certifications, if the source profile contains a URL for an item, put it in the "link" field; otherwise leave "link" empty.
 
GAP ANALYSIS RULES (help the candidate win WITHOUT lying):
- 'adjacent' means the candidate has genuinely related real experience. The honestBridge must name the REAL thing they did (e.g. "built Looker Studio dashboards" as a bridge to "data visualization") — it must NEVER claim the missing tool itself. Do not put the missing tool on the resume unless the profile already supports it.
- 'learnable' is for real skills the candidate lacks but could plausibly gain a defensible beginner level in a few days — suggest the concrete step. Do NOT add these to the resume; they're for the candidate to actually go learn.
- 'genuine-gap' is for anything that can't be honestly bridged. Be honest that it's a gap.
- The resume itself must STILL obey the truthfulness lock — gapAnalysis is advice to the candidate, not license to add unsupported claims to the resume.
${customPrompt.trim() ? `\nUSER'S CUSTOM INSTRUCTIONS (follow where possible, but the TRUTHFULNESS LOCK and one-page rule ALWAYS win — if an instruction asks you to add something not in the profile, refuse it and note it in fabricationWarnings):\n${customPrompt.trim()}\n` : ""}
Return ONLY valid JSON (no markdown):
{
  "summary": "2-3 line summary tailored to the job",
  "skills": "comma-separated, most relevant first",
  "experienceStructured": [{"role":"","company":"","location":"","dates":"","bullets":["",""]}],
  "projectsStructured": [{"name":"","tech":"","link":"","bullets":[""]}],
  "educationStructured": [{"degree":"","school":"","location":"","dates":""}],
  "certificationsStructured": [{"name":"","link":""}],
  "keywordsMatched": ["keywords reflected"],
  "keywordsMissing": ["important job keywords NOT in the background"],
  "matchScore": 0-100 integer,
  "scoreBreakdown": {"keywordMatch": 0-100, "experienceRelevance": 0-100, "seniorityFit": 0-100},
  "scoreRationale": "2-3 sentences explaining WHY this score — what pulled it up and what held it back",
  "improvements": ["specific, actionable steps to raise the score, ranked highest-impact first — e.g. 'Add a bullet showing Tableau or Power BI dashboard work', 'Quantify the pipeline cost savings with a %'"],
  "fabricationWarnings": ["claims not grounded in the profile — empty if none"],
  "notes": "1-2 sentences on what you emphasized",
  "matchVerdict": "one of: 'strong', 'moderate', 'weak'. Judge OVERALL realistic chance of getting an interview, weighting technical/skills fit heavily. Do NOT let a years-of-experience gap alone force 'weak': many postings list X years but hire strong candidates with less. Reserve 'weak' for when core technical skills or the domain don't match, or the seniority gap is very large (e.g. a new grad vs a lead/manager role). A candidate with strong technical fit but slightly junior years is usually 'moderate'.",
  "matchVerdictReason": "1-2 plain, encouraging-but-honest sentences on the realistic odds and what mainly drives them",
  "gapAnalysis": [
    {
      "keyword": "a specific skill/tool the JD wants that is NOT solidly in the profile",
      "status": "one of: 'adjacent' (candidate has closely related real experience they can honestly frame), 'learnable' (could gain a real beginner competency quickly before applying), 'genuine-gap' (no honest bridge — do not claim it)",
      "honestBridge": "for 'adjacent': the TRUTHFUL way to surface this using real profile experience, naming the real thing they did — NEVER claim the tool itself if unused. For 'learnable': the fastest concrete way to get a real, defensible beginner competency (specific resource/project, ~a few days). For 'genuine-gap': empty string.",
      "resumeRelevant": true/false
    }
  ]
}
 
CANDIDATE PROFILE (raw):
${JSON.stringify(profile, null, 2)}
 
TARGET JOB DESCRIPTION:
${jd}`;
  return safeParse(await geminiCall(key, [{ text: prompt }], TAILOR_CFG), "Resume tailoring");
}
async function auditTailoredResume(key, profile, resume) {
  const prompt = `Act as a strict resume fact checker. Compare every claim in the GENERATED RESUME against the SOURCE PROFILE. A claim is supported only when the source explicitly states it or it is a faithful rephrasing. Flag invented skills, tools, employers, titles, dates, degrees, certifications, projects, responsibilities, and especially invented or inflated metrics. Also flag vague or awkward writing that should be reviewed. Do not reward keyword matching and do not assume facts.

For every unsupported claim, provide the exact substring from the generated resume, a truthful replacement grounded only in the source, a concise reason, and the exact source evidence. Keep replacements concise and grammatically compatible with the original location.

Return ONLY valid JSON:
{"corrections":[{"original":"exact generated substring","replacement":"truthful replacement","reason":"why correction is required","sourceEvidence":"exact supporting source text"}],"qualityIssues":["specific writing or clarity issue"],"verdict":"pass or review"}

SOURCE PROFILE:
${JSON.stringify(profile, null, 2)}

GENERATED RESUME:
${JSON.stringify(resume, null, 2)}`;
  const raw = safeParse(await geminiCall(key, [{ text: prompt }], AUDIT_CFG, GEMINI_FAST_MODEL), "Quality review");
  const corrections = Array.isArray(raw?.corrections) ? raw.corrections.slice(0, 20).map((item = {}) => ({ original: asString(item.original), replacement: asString(item.replacement), reason: asString(item.reason), sourceEvidence: asString(item.sourceEvidence) })).filter((item) => item.original && item.reason) : [];
  const qualityIssues = asStrings(raw?.qualityIssues).slice(0, 20);
  return { corrections, unsupportedClaims: corrections.map((item) => `${item.original}: ${item.reason}`), qualityIssues, verdict: corrections.length ? "review" : "pass" };
}
async function regenerateResumeSection(key, profile, jd, resume, section) {
  const prompt = `Rewrite ONLY the requested resume section to improve clarity, impact, and relevance to the job. Use only facts explicitly supported by the source profile. Never invent skills, tools, metrics, dates, employers, or responsibilities. Return ONLY valid JSON with one property named "${section}" using the same shape as the current section.

SOURCE PROFILE:
${JSON.stringify(profile, null, 2)}

JOB DESCRIPTION:
${jd}

CURRENT ${section.toUpperCase()}:
${JSON.stringify(resume[section], null, 2)}`;
  const raw = safeParse(await geminiCall(key, [{ text: prompt }], JSON_CFG), "Section rewrite");
  return normalizeTailoredResult({ ...resume, [section]: raw?.[section] })[section];
}
async function classifyJD(key, text) {
  const prompt = `Decide whether the following text is a JOB DESCRIPTION / job posting (a specific role an employer is hiring for, with responsibilities, requirements, or qualifications).
 
Return ONLY valid JSON (no markdown):
{"isJobDescription": true or false, "whatItIs": "if NOT a job description, 3-8 words naming what it actually is (e.g. 'an article about ATS resumes', 'a resume', 'a cover letter', 'random notes'). If it IS a job description, empty string."}
 
TEXT:
${text.slice(0, 4000)}`;
  return safeParse(await geminiCall(key, [{ text: prompt }], FAST_JSON_CFG), "JD check");
}
async function writeCoverLetter(key, profile, jd, result) {
  const prompt = `Write a concise professional cover letter (3 short paragraphs, ~200 words) for this candidate applying to this job. Warm but not flowery. Reference 2-3 real achievements from the profile that match the job. Invent nothing. Start "Dear Hiring Manager," if no name known; sign off with the candidate's name. Return ONLY the letter text.
CANDIDATE: ${JSON.stringify(profile)}
HIGHLIGHTS: ${JSON.stringify(result?.notes || "")}
JOB: ${jd}`;
  return geminiCall(key, [{ text: prompt }]);
}
 
async function makeInterviewPrep(key, profile, jd) {
  const prompt = `You are an interview coach. Using the candidate's profile and the target job description, produce realistic interview prep. Ground behavioral answers in the candidate's REAL experience — never invent projects, employers, or metrics. Keep answers tight and usable.
 
Return ONLY valid JSON (no markdown):
{
  "technical": [ {"q":"a technical question likely for this role","a":"a concise model answer / what a strong answer covers, tailored to the candidate's stack"} ],
  "behavioral": [ {"q":"a behavioral question","a":"a STAR-style answer drawn from the candidate's real experience"} ],
  "askThem": ["a sharp question the candidate could ask the interviewer"],
  "focusAreas": ["skills or topics from the JD the candidate should brush up on before the interview"]
}
Aim for 5-6 technical, 4-5 behavioral, 3-4 askThem, 3-4 focusAreas.
 
CANDIDATE PROFILE:
${JSON.stringify(profile, null, 2)}
 
TARGET JOB DESCRIPTION:
${jd}`;
  return safeParse(await geminiCall(key, [{ text: prompt }], JSON_CFG), "Interview prep");
}
 
// ─── Theme: soft liquid-glass on a rich dark purple base ─────────────────────
const P = {
  ink: "#f2eefc", muted: "#b6acd6", faint: "#8b81ad",
  accent: "#b39dff", accentDeep: "#c9b8ff", accentSoft: "rgba(150,120,255,0.18)",
  glass: "rgba(255,255,255,0.07)", glassBorder: "rgba(255,255,255,0.14)",
  glassHi: "rgba(255,255,255,0.12)",
  danger: "#ff9b8a", dangerSoft: "rgba(255,90,70,0.15)",
  warn: "#f2c879", warnSoft: "rgba(240,180,60,0.14)", ok: "#7fe0ad",
  field: "rgba(255,255,255,0.06)", fieldBorder: "rgba(255,255,255,0.16)",
};
const font = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
 
// Background options for the toggle. Photos are stable Unsplash CDN URLs (free, no key).
// "gradient" always works offline as a fallback.
const BACKGROUNDS = [
  { id: "forest", label: "Autumn forest", type: "photo", url: "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=1920&q=80" },
  { id: "mountain", label: "Misty mountains", type: "photo", url: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1920&q=80" },
  { id: "ocean", label: "Ocean dusk", type: "photo", url: "https://images.unsplash.com/photo-1505118380757-91f5f5632de0?w=1920&q=80" },
  { id: "aurora", label: "Aurora", type: "photo", url: "https://images.unsplash.com/photo-1483347756197-71ef80e95f73?w=1920&q=80" },
  { id: "gradient", label: "Soft gradient", type: "gradient" },
];
const glassCard = {
  background: "rgba(255,255,255,0.07)", backdropFilter: "blur(25px) saturate(200%)", WebkitBackdropFilter: "blur(25px) saturate(200%)",
  border: "2px solid rgba(255,255,255,0.15)", borderRadius: 20, padding: 24,
  boxShadow: "0 10px 40px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.14)",
};
 
function Field({ label, value, onChange, placeholder, area, rows = 3, half, type = "text" }) {
  const shared = { width: "100%", marginTop: 5, padding: "9px 11px", fontSize: 13, fontFamily: font, border: `1px solid ${P.fieldBorder}`, borderRadius: 11, background: P.field, boxSizing: "border-box", color: P.ink, outline: "none" };
  return (
    <label style={{ display: "block", marginBottom: 13, flex: half ? "1 1 45%" : "1 1 100%" }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: P.muted, letterSpacing: 0.2 }}>{label}</span>
      {area
        ? <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={rows} style={{ ...shared, resize: "vertical" }} />
        : <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} style={shared} />}
    </label>
  );
}
 
export default function App() {
  const [tab, setTab] = useState("profile");
  const [rememberKey, setRememberKey] = useState(() => Boolean(loadLS(LS_KEY, "")));
  const [apiKey, setApiKey] = useState(() => loadLS(LS_KEY, "") || sessionStorage.getItem(LS_KEY) || "");
  const [showKey, setShowKey] = useState(false);
  const [profiles, setProfiles] = useState(() => loadProfiles());
  const [activeId, setActiveId] = useState(() => {
    const saved = loadLS(LS_ACTIVE, null);
    const all = profiles;
    return saved && all[saved] ? saved : Object.keys(all)[0];
  });
  const [mode, setMode] = useState("me"); // "me" | "other"
  const [otherProfile, setOtherProfile] = useState(DEFAULT_PROFILE);
  const [jd, setJd] = useState("");
  const [customPrompt, setCustomPrompt] = useState("");
  const [jobLabel, setJobLabel] = useState("");
  const [jdImgName, setJdImgName] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [tex, setTex] = useState("");
  const [coverLetter, setCoverLetter] = useState("");
  const [clLoading, setClLoading] = useState(false);
  const [history, setHistory] = useState(() => loadLS(LS_HISTORY, []));
  const [applications, setApplications] = useState(() => loadLS(LS_APPLICATIONS, []));
  const [profileSaved, setProfileSaved] = useState(false);
  const [prep, setPrep] = useState(null);
  const [prepLoading, setPrepLoading] = useState(false);
  const [prepJd, setPrepJd] = useState("");
  const [pageOverflow, setPageOverflow] = useState(false);
  const [printPages, setPrintPages] = useState(1);
  const [editingResult, setEditingResult] = useState(false);
  const [regeneratingSection, setRegeneratingSection] = useState("");
  const [bgId, setBgId] = useState(() => loadLS("resumeTailor.bg", "forest"));
  useEffect(() => { saveLS("resumeTailor.bg", bgId); }, [bgId]);
  const bg = BACKGROUNDS.find((b) => b.id === bgId) || BACKGROUNDS[0];
  const cycleBg = () => { const i = BACKGROUNDS.findIndex((b) => b.id === bgId); setBgId(BACKGROUNDS[(i + 1) % BACKGROUNDS.length].id); };
  const jdFileRef = useRef();
  const resumeFileRef = useRef();
  const backupFileRef = useRef();
  const previewRef = useRef();
 
  useEffect(() => {
    sessionStorage.setItem(LS_KEY, apiKey);
    if (rememberKey) saveLS(LS_KEY, apiKey); else localStorage.removeItem(LS_KEY);
  }, [apiKey, rememberKey]);
  useEffect(() => { saveLS(LS_PROFILES, profiles); }, [profiles]);
  useEffect(() => { saveLS(LS_ACTIVE, activeId); }, [activeId]);
  useEffect(() => { saveLS(LS_HISTORY, history); }, [history]);
  useEffect(() => { saveLS(LS_APPLICATIONS, applications); }, [applications]);
 
  useEffect(() => {
    if (!result) { setPageOverflow(false); setPrintPages(1); return; }
    const id = setTimeout(() => {
      const probe = document.createElement("div");
      Object.assign(probe.style, { position: "absolute", left: "-10000px", top: "0", width: "7.5in", fontFamily: "Arial, sans-serif", fontSize: "10pt", lineHeight: "1.35", visibility: "hidden" });
      probe.innerHTML = renderResumeInner(result); document.body.appendChild(probe);
      const pages = Math.max(1, Math.ceil(probe.scrollHeight / (10 * 96))); probe.remove();
      setPrintPages(pages); setPageOverflow(pages > 1);
    }, 60);
    return () => clearTimeout(id);
  }, [result]);
 
  const activeProfile = profiles[activeId] || { ...DEFAULT_PROFILE, _label: "My profile" };
  const profile = mode === "me" ? activeProfile : otherProfile;
  const setProfileField = (k) => (v) => {
    if (mode === "me") setProfiles((all) => ({ ...all, [activeId]: { ...all[activeId], [k]: v } }));
    else setOtherProfile((p) => ({ ...p, [k]: v }));
  };
  const setActiveProfileFull = (obj) => setProfiles((all) => ({ ...all, [activeId]: { ...all[activeId], ...obj } }));
  function addProfile() {
    const label = window.prompt("Name this profile (e.g. \"Data Analyst\", \"Data Engineer\"):", "");
    if (label == null) return;
    const id = uid();
    setProfiles((all) => ({ ...all, [id]: { ...DEFAULT_PROFILE, _label: label.trim() || "Untitled" } }));
    setActiveId(id);
    setStatus(`Created profile "${label.trim() || "Untitled"}". Fill it in and Save.`);
  }
  function renameProfile() {
    const label = window.prompt("Rename this profile:", activeProfile._label || "");
    if (label == null) return;
    setProfiles((all) => ({ ...all, [activeId]: { ...all[activeId], _label: label.trim() || "Untitled" } }));
  }
  function duplicateProfile() {
    const id = uid();
    const copy = { ...activeProfile, _label: (activeProfile._label || "Profile") + " (copy)" };
    setProfiles((all) => ({ ...all, [id]: copy }));
    setActiveId(id);
    setStatus("Duplicated — a good way to make a variant for a different role type.");
  }
  function deleteProfile() {
    const ids = Object.keys(profiles);
    if (ids.length <= 1) { setStatus("Can't delete your only profile."); return; }
    if (!window.confirm(`Delete profile "${activeProfile._label}"? This can't be undone.`)) return;
    setProfiles((all) => { const n = { ...all }; delete n[activeId]; return n; });
    setActiveId(ids.find((i) => i !== activeId));
  }
  const profileFilled = profile.name && profile.experience && profile.email;
  const hasKey = apiKey.trim().length > 10;
 
  async function handleJDImage(e) {
    const files = Array.from(e.target.files || []); if (!files.length) return;
    if (files.length > 6 || files.some((f) => f.size > 8 * 1024 * 1024)) { setStatus("Use at most 6 images, no larger than 8 MB each."); e.target.value = ""; return; }
    if (!hasKey) { setStatus("Add your free Gemini API key first."); return; }
    setJdImgName(files.length === 1 ? files[0].name : `${files.length} screenshots`);
    setStatus(files.length === 1 ? "Reading screenshot…" : `Reading & stitching ${files.length} screenshots…`);
    setLoading(true);
    try {
      const images = await Promise.all(files.map(async (f) => ({ data: await fileToBase64(f), mimeType: f.type || "image/png" })));
      const text = images.length === 1
        ? await extractJDFromImage(apiKey, images[0].data, images[0].mimeType)
        : await extractJDFromImages(apiKey, images);
      setJd(text);
      setStatus(files.length === 1 ? "Extracted job description. Review below, then generate." : `Stitched ${files.length} screenshots into one job description. Review below.`);
    } catch (err) { setStatus("Couldn't read image(s): " + err.message); }
    finally { setLoading(false); e.target.value = ""; }
  }
  async function handleResumeUpload(e) {
    const file = e.target.files?.[0]; if (!file) return;
    if (file.size > 10 * 1024 * 1024) { setStatus("Resume files must be 10 MB or smaller."); e.target.value = ""; return; }
    // Protect a curated master profile from being silently wiped by an upload.
    if (mode === "me" && (activeProfile.experience?.trim() || activeProfile.skills?.trim())) {
      if (!window.confirm("This will replace your saved profile with the parsed resume. Your current profile will be overwritten. Continue?")) {
        e.target.value = ""; return;
      }
    }
    setStatus("Reading your resume…"); setLoading(true);
    try {
      let parsed;
      if (file.type.startsWith("image/")) {
        if (!hasKey) throw new Error("Add your Gemini API key to read image resumes.");
        const base64 = await fileToBase64(file);
        const text = await extractJDFromImage(apiKey, base64, file.type);
        parsed = await parseResumeToProfile(apiKey, text);
      } else if (file.type === "application/pdf") {
        if (!hasKey) throw new Error("Add your Gemini API key to read PDF resumes.");
        const base64 = await fileToBase64(file);
        const raw = await geminiCall(apiKey, [{ inline_data: { mime_type: "application/pdf", data: base64 } }, { text: "Extract all text from this resume PDF, raw text only." }], FAST_CFG, GEMINI_FAST_MODEL);
        parsed = await parseResumeToProfile(apiKey, raw);
      } else {
        const text = await file.text();
        const local = parseResumeTextLocally(text);
        if (local.email && local.experience) parsed = local;
        else {
          if (!hasKey) throw new Error("This text resume needs Gemini to understand its layout. Add your API key and retry.");
          parsed = await parseResumeToProfile(apiKey, text);
        }
      }
      const cleaned = normalizeProfile(parsed, mode === "me" ? activeProfile._label : "Someone else");
      if (mode === "me") setActiveProfileFull(cleaned); else setOtherProfile(cleaned);
      setStatus("Filled from your resume — review the fields, tweak anything, then add a job.");
    } catch (err) { setStatus("Couldn't parse resume: " + err.message); }
    finally { setLoading(false); }
  }
 
  async function generate() {
    if (!hasKey) { setStatus("Add your free Gemini API key first."); return; }
    if (!profileFilled) { setTab("profile"); setStatus("Fill in at least name, email, and experience."); return; }
    if (!jd.trim()) { setStatus("Add a job description."); return; }
    if (jd.trim().length < 120) {
      if (!window.confirm("That job description looks quite short — the scores and gap analysis work best with the full posting. Generate anyway?")) return;
    }
    setLoading(true); setCoverLetter("");
    setStatus("Tailoring the resume…");
    try {
      const tailored = normalizeTailoredResult(await tailorResume(apiKey, profile, jd, customPrompt));
      tailored.projectsStructured = rankProjectsByRelevance(tailored.projectsStructured, jd);
      const merged = { name: profile.name, title: profile.title, email: profile.email, phone: profile.phone, location: profile.location, linkedin: profile.linkedin, github: profile.github, website: profile.website, ...tailored };
      merged.keywordCoverage = computeKeywordCoverage(merged, jd);
      merged.qualityChecks = runResumeQualityChecks(merged);
      let t = buildLatex(merged);
      const entryId = uid();
      setResult(merged); setTex(t); setTab("result"); setLoading(false);
      setStatus("Resume ready — running a quick fact-check in the background…");
      setHistory((h) => [{ id: entryId, label: jobLabel || deriveLabel(jd), person: mode === "me" ? (activeProfile._label || "Me") : (profile.name || "Someone else"), date: new Date().toISOString(), jd, result: merged, tex: t }, ...h].slice(0, 20));
      try {
        merged.qualityReview = await auditTailoredResume(apiKey, profile, merged);
        merged.fabricationWarnings = [...new Set([...(merged.fabricationWarnings || []), ...merged.qualityReview.unsupportedClaims])];
        const corrected = applyEvidenceCorrections(merged, merged.qualityReview.corrections);
        if (corrected.applied) {
          Object.assign(merged, corrected.resume);
          merged.qualityReview.autoCorrected = corrected.applied;
          merged.fabricationWarnings = (merged.fabricationWarnings || []).filter((warning) => !corrected.appliedOriginals.some((original) => warning.startsWith(`${original}:`)));
          merged.qualityChecks = runResumeQualityChecks(merged);
          merged.keywordCoverage = computeKeywordCoverage(merged, jd);
        }
      } catch (auditError) {
        merged.qualityReview = { verdict: "unavailable", unsupportedClaims: [], qualityIssues: [], error: auditError.message };
      }
      t = buildLatex(merged);
      setResult({ ...merged }); setTex(t); setStatus("Done — review, then download.");
      setHistory((h) => h.map((entry) => entry.id === entryId ? { ...entry, result: merged, tex: t } : entry));
    } catch (err) { setStatus("Generation failed: " + err.message); }
    finally { setLoading(false); }
  }
  async function genCoverLetter() {
    if (!hasKey || !result) return; setClLoading(true);
    try { setCoverLetter(await writeCoverLetter(apiKey, profile, jd, result)); }
    catch (err) { setStatus("Cover letter failed: " + err.message); }
    finally { setClLoading(false); }
  }
  async function genPrep() {
    if (!hasKey) { setStatus("Add your free Gemini API key first."); return; }
    const useJd = prepJd.trim() || jd.trim();
    if (!useJd) { setStatus("Paste a job description in the Interview Prep tab (or generate a resume first)."); return; }
    if (!profileFilled) { setStatus("Fill your profile first so answers can use your real experience."); return; }
    setPrepLoading(true); setStatus("Building your interview prep…");
    try { setPrep(await makeInterviewPrep(apiKey, profile, useJd)); setStatus("Interview prep ready."); }
    catch (err) { setStatus("Prep failed: " + err.message); }
    finally { setPrepLoading(false); }
  }
  function openHistory(e) { setResult(e.result); setTex(e.tex); setJd(e.jd); setJobLabel(e.label || ""); setCoverLetter(""); setTab("result"); setStatus(`Loaded: ${e.label}`); }
  function deleteHistory(id) { setHistory((h) => h.filter((e) => e.id !== id)); }
  function trackApplication() {
    if (!result) return;
    const label = jobLabel || deriveLabel(jd);
    setApplications((items) => [{ id: uid(), company: label.includes("—") ? label.split("—")[0].trim() : "", role: label.includes("—") ? label.split("—").slice(1).join("—").trim() : label, status: "Preparing", date: new Date().toISOString().slice(0, 10), notes: "", matchScore: result.matchScore }, ...items]);
    setStatus("Added to application tracker.");
  }
  const updateApplication = (id, field, value) => setApplications((items) => items.map((item) => item.id === id ? { ...item, [field]: value } : item));
  function updateGenerated(next) { setResult(next); setTex(buildLatex(next)); }
  async function regenerateSection(section) {
    if (!result || !hasKey) { setStatus("Add your Gemini key before rewriting a section."); return; }
    setRegeneratingSection(section); setStatus(`Improving ${section.replace("Structured", "")}…`);
    try {
      const value = await regenerateResumeSection(apiKey, profile, jd, result, section);
      updateGenerated({ ...result, [section]: value });
      setStatus("Section improved. Review the changes before downloading.");
    } catch (err) { setStatus("Section rewrite failed: " + err.message); }
    finally { setRegeneratingSection(""); }
  }
  function exportBackup() {
    const payload = { version: 1, exportedAt: new Date().toISOString(), profiles, activeId, history, applications, background: bgId };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a");
    a.href = url; a.download = `resume-tailor-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click(); URL.revokeObjectURL(url);
  }
  async function importBackup(e) {
    const file = e.target.files?.[0]; if (!file) return;
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error("Backup must be 5 MB or smaller.");
      const data = JSON.parse(await file.text());
      if (data?.version !== 1 || !data.profiles || typeof data.profiles !== "object") throw new Error("This is not a valid Resume Tailor backup.");
      const ids = Object.keys(data.profiles); if (!ids.length) throw new Error("The backup has no profiles.");
      setProfiles(data.profiles); setActiveId(ids.includes(data.activeId) ? data.activeId : ids[0]);
      setHistory(Array.isArray(data.history) ? data.history.slice(0, 20) : []);
      setApplications(Array.isArray(data.applications) ? data.applications.slice(0, 200) : []);
      if (BACKGROUNDS.some((b) => b.id === data.background)) setBgId(data.background);
      setStatus("Backup restored successfully.");
    } catch (err) { setStatus("Could not restore backup: " + err.message); }
    finally { e.target.value = ""; }
  }
  function downloadTex() {
    const blob = new Blob([tex], { type: "text/plain" }); const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `${(result?.name || "resume").replace(/\s+/g, "_")}.tex`; a.click(); URL.revokeObjectURL(url);
  }
  async function downloadPdf() {
    if (!previewRef.current) return; setStatus("Building PDF…");
    try {
      const { default: html2pdf } = await import("html2pdf.js");
      await html2pdf().set({ margin: [0.5, 0.55, 0.5, 0.55], filename: `${(result?.name || "resume").replace(/\s+/g, "_")}.pdf`, image: { type: "jpeg", quality: 0.98 }, html2canvas: { scale: 2, useCORS: true }, jsPDF: { unit: "in", format: "letter", orientation: "portrait" }, enableLinks: true }).from(previewRef.current).save();
      setStatus("PDF downloaded.");
    } catch (err) { setStatus("PDF failed: " + err.message); }
  }
  async function downloadDocx() {
    if (!result) return; setStatus("Building ATS Word document…");
    try {
      const { buildResumeDocxBlob } = await import("./docxExport.js");
      const blob = await buildResumeDocxBlob(result); const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `${(result.name || "resume").replace(/\s+/g, "_")}.docx`; a.click(); URL.revokeObjectURL(url);
      setStatus("ATS Word document downloaded.");
    } catch (err) { setStatus("Word export failed: " + err.message); }
  }
  function printAtsPdf() {
    if (!result) return;
    if (pageOverflow && !window.confirm(`This resume is estimated at ${printPages} pages. Continue to the print dialog anyway?`)) return;
    const popup = window.open("", "_blank");
    if (!popup) { setStatus("Allow pop-ups, then try ATS PDF again."); return; }
    popup.opener = null;
    popup.document.write(`<!doctype html><html><head><title>${String(result.name || "Resume").replace(/[<>]/g, "")}</title><meta charset="utf-8"><style>@page{size:letter;margin:.5in}*{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;color:#111;font-size:10pt;line-height:1.35;margin:0}a{color:#111!important;text-decoration:none}h2{break-after:avoid}li,div{break-inside:avoid}@media print{button{display:none}}</style></head><body>${renderResumeInner(result)}<script>window.onload=()=>setTimeout(()=>window.print(),150)<\/script></body></html>`);
    popup.document.close();
    setStatus("Print dialog opened — choose ‘Save as PDF’. This version keeps selectable ATS-readable text.");
  }
 
  const tabBtn = (active, extra = {}) => ({ padding: "7px 15px", fontSize: 13, fontWeight: 600, fontFamily: font, border: `1px solid ${active ? "transparent" : P.glassBorder}`, background: active ? "linear-gradient(135deg,#8b6bff,#a855f7)" : P.glassHi, color: active ? "#fff" : P.ink, borderRadius: 11, cursor: "pointer", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", ...extra });
  const score = result?.matchScore;
  const scoreColor = score == null ? P.muted : score >= 75 ? P.ok : score >= 50 ? P.warn : P.danger;
  // Coverage: prefer the deterministic count; if it can't run (JD text missing,
  // or too few vocab hits), fall back to the AI's own matched/missing keyword
  // lists so the user still gets a meaningful number.
  const coverage = (() => {
    if (!result) return null;
    const det = result.keywordCoverage || computeKeywordCoverage(result, jd);
    if (det) return det;
    const m = result.keywordsMatched || [], mi = result.keywordsMissing || [];
    if (m.length + mi.length >= 3) {
      return { matched: m, missing: mi, pct: Math.round((m.length / (m.length + mi.length)) * 100), fromAI: true };
    }
    return null;
  })();
 
  return (
    <div style={{ fontFamily: font, minHeight: "100vh", color: P.ink, position: "relative", overflow: "hidden", background: "#0f0a1e" }}>
      {/* Background layer — photo or gradient, with liquid refraction. */}
      <div aria-hidden style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none" }}>
        {bg.type === "photo" ? (
          <div style={{ position: "absolute", inset: "-40px", backgroundImage: `url(${bg.url})`, backgroundSize: "cover", backgroundPosition: "center", filter: "url(#liquid-refraction)" }} />
        ) : (
          <div style={{ position: "absolute", inset: "-40px", filter: "url(#liquid-refraction)" }}>
            <div style={{ position: "absolute", top: "-8%", left: "-5%", width: 520, height: 520, borderRadius: "50%", background: "radial-gradient(circle, #7b5cff, transparent 65%)", filter: "blur(40px)", opacity: 0.7 }} />
            <div style={{ position: "absolute", top: "20%", right: "-10%", width: 560, height: 560, borderRadius: "50%", background: "radial-gradient(circle, #b84dff, transparent 65%)", filter: "blur(48px)", opacity: 0.55 }} />
            <div style={{ position: "absolute", bottom: "-15%", left: "25%", width: 620, height: 620, borderRadius: "50%", background: "radial-gradient(circle, #3d7bff, transparent 65%)", filter: "blur(52px)", opacity: 0.5 }} />
          </div>
        )}
        {/* readability veil so light text stays legible over any photo */}
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(15,10,30,0.55), rgba(15,10,30,0.68))" }} />
      </div>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "34px 20px 70px", position: "relative", zIndex: 1 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0, letterSpacing: -0.6, background: `linear-gradient(90deg, #d9ccff, #b39dff)`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Resume Tailor</h1>
            <p style={{ color: P.muted, fontSize: 14, marginTop: 5 }}>Paste a job → a tailored, ATS-friendly resume with a match score, cover letter, and clickable links.</p>
          </div>
          <button onClick={cycleBg} title="Change background" style={{ ...tabBtn(false), whiteSpace: "nowrap" }}>🖼 {bg.label}</button>
        </div>
 
        <div style={{ ...glassCard, padding: "12px 16px", margin: "18px 0" }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: P.accentDeep, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 7 }}>Gemini API key {hasKey ? "✓ saved" : "— required"}</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input aria-label="Gemini API key" type={showKey ? "text" : "password"} value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="Paste your free Gemini API key…" style={{ flex: "1 1 260px", padding: "9px 11px", fontSize: 13, fontFamily: font, border: `1px solid ${P.fieldBorder}`, borderRadius: 11, background: P.field, color: P.ink, outline: "none" }} />
            <button style={tabBtn(false)} onClick={() => setShowKey((s) => !s)}>{showKey ? "Hide" : "Show"}</button>
            <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" style={{ ...tabBtn(false), textDecoration: "none" }}>Get a free key ↗</a>
          </div>
          <label style={{ display: "inline-flex", gap: 7, alignItems: "center", marginTop: 9, color: P.muted, fontSize: 11.5 }}>
            <input type="checkbox" checked={rememberKey} onChange={(e) => setRememberKey(e.target.checked)} /> Remember key after I close this tab
          </label>
          <div style={{ color: P.faint, fontSize: 11, marginTop: 5 }}>Your resume, job description, and key are relayed securely to Google Gemini and are not stored by this app. No paid server is used.</div>
        </div>
 
        <div role="tablist" aria-label="Resume workflow" style={{ display: "flex", gap: 8, margin: "16px 0", flexWrap: "wrap" }}>
          <button role="tab" aria-selected={tab === "profile"} style={tabBtn(tab === "profile")} onClick={() => setTab("profile")}>1 · Profile</button>
          <button role="tab" aria-selected={tab === "job"} style={tabBtn(tab === "job")} onClick={() => setTab("job")}>2 · Job</button>
          <button role="tab" aria-selected={tab === "result"} style={tabBtn(tab === "result")} onClick={() => setTab("result")} disabled={!result}>3 · Result</button>
          <button role="tab" aria-selected={tab === "prep"} style={tabBtn(tab === "prep")} onClick={() => setTab("prep")}>🎤 Interview prep</button>
          <button role="tab" aria-selected={tab === "history"} style={tabBtn(tab === "history")} onClick={() => setTab("history")}>History ({history.length})</button>
          <button role="tab" aria-selected={tab === "applications"} style={tabBtn(tab === "applications")} onClick={() => setTab("applications")}>Applications ({applications.length})</button>
        </div>
 
        {status && <div role="status" aria-live="polite" style={{ ...glassCard, padding: "9px 14px", fontSize: 13, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>{loading && <Spinner />}{status}</div>}
 
        {tab === "profile" && (
          <div style={glassCard}>
            <div style={{ display: "flex", gap: 6, marginBottom: 14, background: P.field, padding: 5, borderRadius: 13, width: "fit-content", border: `1px solid ${P.glassBorder}` }}>
              <button onClick={() => setMode("me")} style={{ ...tabBtn(mode === "me"), border: "none" }}>My profiles</button>
              <button onClick={() => setMode("other")} style={{ ...tabBtn(mode === "other"), border: "none" }}>Someone else</button>
            </div>
 
            {mode === "me" && (
              <div style={{ marginBottom: 14 }}>
                <SectionLabel>Profile</SectionLabel>
                <div style={{ fontSize: 12, color: P.muted, marginBottom: 8 }}>
                  Keep separate master profiles for different role types (e.g. Data Analyst vs Data Engineer). Pick one to tailor from.
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                  {Object.entries(profiles).map(([id, p]) => (
                    <button key={id} onClick={() => setActiveId(id)}
                      style={{ ...tabBtn(id === activeId), padding: "6px 14px", fontSize: 12.5 }}>
                      {p._label || "Untitled"}
                    </button>
                  ))}
                  <button onClick={addProfile} title="New profile" style={{ ...tabBtn(false), padding: "6px 12px", fontSize: 12.5 }}>+ New</button>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                  <button onClick={renameProfile} style={{ ...tabBtn(false), padding: "4px 11px", fontSize: 11.5 }}>Rename</button>
                  <button onClick={duplicateProfile} style={{ ...tabBtn(false), padding: "4px 11px", fontSize: 11.5 }}>Duplicate</button>
                  {Object.keys(profiles).length > 1 && (
                    <button onClick={deleteProfile} style={{ ...tabBtn(false), padding: "4px 11px", fontSize: 11.5, color: P.danger }}>Delete</button>
                  )}
                </div>
              </div>
            )}
 
            <div style={{ fontSize: 12.5, color: P.muted, marginBottom: 16 }}>
              {mode === "me"
                ? `Editing "${activeProfile._label || "profile"}". Changes save automatically. Auto-fill from a resume below if you like.`
                : "A blank profile for making a resume for someone else. Your own saved profiles stay untouched."}
            </div>
 
            <div style={{ display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
              <button style={{ ...tabBtn(false), background: P.accentSoft, borderColor: "transparent", color: P.accentDeep }} onClick={() => resumeFileRef.current?.click()}>⬆ Auto-fill from an existing resume</button>
              {mode === "me" && (
                <button style={{ ...tabBtn(false) }} onClick={() => { setProfiles((all) => ({ ...all })); setProfileSaved(true); setStatus("Saved. Your profiles load automatically every visit."); setTimeout(() => setProfileSaved(false), 2500); }}>
                  {profileSaved ? "✓ Saved" : "💾 Save"}
                </button>
              )}
              <input ref={resumeFileRef} type="file" accept=".pdf,.txt,.md,image/*" hidden onChange={handleResumeUpload} />
            </div>
 
            <SectionLabel>Contact</SectionLabel>
            <Row>
              <Field half label="Full name *" value={profile.name} onChange={setProfileField("name")} placeholder="Jane Doe" />
              <Field half label="Target title" value={profile.title} onChange={setProfileField("title")} placeholder="Senior Data Engineer" />
            </Row>
            <Row>
              <Field half label="Email *" value={profile.email} onChange={setProfileField("email")} placeholder="jane@email.com" />
              <Field half label="Phone" value={profile.phone} onChange={setProfileField("phone")} placeholder="+1 555 123 4567" />
            </Row>
            <Row>
              <Field half label="Location" value={profile.location} onChange={setProfileField("location")} placeholder="Austin, TX" />
              <Field half label="LinkedIn URL" value={profile.linkedin} onChange={setProfileField("linkedin")} placeholder="linkedin.com/in/…" />
            </Row>
            <Row>
              <Field half label="GitHub URL" value={profile.github} onChange={setProfileField("github")} placeholder="github.com/…" />
              <Field half label="Website" value={profile.website} onChange={setProfileField("website")} placeholder="janedoe.dev" />
            </Row>
            <SectionLabel>Your material (AI structures & tailors this)</SectionLabel>
            <Field area rows={2} label="Current professional summary — preserve exact years and positioning" value={profile.summary} onChange={setProfileField("summary")} placeholder="Data analyst with 4 years of experience building dashboards and automated reporting." />
            <Field area rows={4} label="Experience * — roles, companies, dates, what you did" value={profile.experience} onChange={setProfileField("experience")} placeholder={"Data Engineer, Acme Corp (2021–present)\n- Built GCP data pipelines...\n- Cut costs 30%..."} />
            <Field area rows={3} label="Skills" value={profile.skills} onChange={setProfileField("skills")} placeholder="Python, SQL, BigQuery, dbt, Airflow, GCP…" />
            <Field area rows={3} label="Projects — add a repo URL after each for a clickable link" value={profile.projects} onChange={setProfileField("projects")} placeholder={"Syndication Pipeline — dbt + BigQuery — github.com/you/syndication\nMarfeel ETL — Cloud Run — github.com/you/marfeel"} />
            <Field area rows={2} label="Education" value={profile.education} onChange={setProfileField("education")} placeholder="B.S. Computer Science, State University (2019)" />
            <Field area rows={2} label="Certifications — add a verify URL for a clickable link" value={profile.certifications} onChange={setProfileField("certifications")} placeholder="GCP Professional Data Engineer — credential.net/abc123" />
            <button style={{ ...tabBtn(true), padding: "11px 22px", marginTop: 8 }} onClick={() => setTab("job")}>Next: add a job →</button>
          </div>
        )}
 
        {tab === "job" && (
          <div style={glassCard}>
            <Field label="Job label (optional — for your history)" value={jobLabel} onChange={setJobLabel} placeholder="e.g. Google — Data Engineer" />
            <SectionLabel>Upload a screenshot of the job posting</SectionLabel>
            <div onClick={() => jdFileRef.current?.click()} style={{ border: `2px dashed ${P.fieldBorder}`, borderRadius: 14, padding: 24, textAlign: "center", cursor: "pointer", background: P.field, marginBottom: 8 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{jdImgName ? `📎 ${jdImgName}` : "Click to upload screenshot(s)"}</div>
              <div style={{ fontSize: 12, color: P.muted, marginTop: 4 }}>PNG / JPG — upload one, or several parts of a long posting (they'll be stitched in order)</div>
              <input ref={jdFileRef} type="file" accept="image/*" multiple hidden onChange={handleJDImage} />
            </div>
            <div style={{ textAlign: "center", color: P.muted, fontSize: 12, margin: "10px 0" }}>— or —</div>
            <SectionLabel>Paste the job description</SectionLabel>
            <textarea value={jd} onChange={(e) => setJd(e.target.value)} rows={10} placeholder="Paste the full job description here…" style={{ width: "100%", padding: "11px 13px", fontSize: 13, fontFamily: font, border: `1px solid ${P.fieldBorder}`, borderRadius: 12, background: P.field, boxSizing: "border-box", resize: "vertical", color: P.ink, outline: "none" }} />
            <SectionLabel>Custom instructions (optional — tell the AI what you want)</SectionLabel>
            <textarea value={customPrompt} onChange={(e) => setCustomPrompt(e.target.value)} rows={3} placeholder="e.g. Emphasize my GCP + dbt work, downplay the retail job, lead with metrics, keep a data-engineering tone…" style={{ width: "100%", padding: "11px 13px", fontSize: 13, fontFamily: font, border: `1px solid ${P.fieldBorder}`, borderRadius: 12, background: P.field, boxSizing: "border-box", resize: "vertical", color: P.ink, outline: "none" }} />
            <button style={{ ...tabBtn(true), padding: "12px 24px", marginTop: 12, opacity: loading ? 0.6 : 1 }} onClick={generate} disabled={loading}>{loading ? "Working…" : "✦ Generate tailored resume"}</button>
          </div>
        )}
 
        {tab === "result" && result && (
          <div style={glassCard}>
            {result.matchVerdict && (() => {
              const v = result.matchVerdict;
              const cfg = v === "strong"
                ? { c: P.ok, bg: "rgba(47,125,87,0.15)", bd: "rgba(127,224,173,0.4)", label: "Strong match", sub: "Go for it — this one's worth your time." }
                : v === "moderate"
                ? { c: P.warn, bg: P.warnSoft, bd: "#f0d5a0", label: "Worth a shot", sub: "Decent fit. Apply if you like the role — just prep the gaps below." }
                : { c: P.danger, bg: P.dangerSoft, bd: "rgba(255,155,138,0.4)", label: "Bit of a stretch", sub: "You can still apply, but similar roles at your level are a better bet for your time." };
              return (
                <div style={{ background: cfg.bg, border: `1px solid ${cfg.bd}`, borderRadius: 12, padding: "14px 16px", marginBottom: 16 }}>
                  <div style={{ fontSize: 17, fontWeight: 800, color: cfg.c }}>{cfg.label}</div>
                  <div style={{ fontSize: 12.5, color: P.ink, marginTop: 3, opacity: 0.85 }}>{cfg.sub}</div>
                  {result.matchVerdictReason && <div style={{ fontSize: 12.5, color: P.muted, marginTop: 8, lineHeight: 1.5 }}>{result.matchVerdictReason}</div>}
                </div>
              );
            })()}
            {coverage && !coverage.fromAI && typeof result.scoreBreakdown?.keywordMatch === "number" && result.scoreBreakdown.keywordMatch - coverage.pct >= 40 && (
              <div style={{ background: P.warnSoft, border: `1px solid #f0d5a0`, borderRadius: 12, padding: "10px 12px", fontSize: 12.5, marginBottom: 16, color: P.warn, lineHeight: 1.5 }}>
                <strong>⚠ These two numbers disagree a lot.</strong> That usually means the "job description" you pasted wasn't a real posting (or was very short), so the measured keyword count isn't meaningful here. For accurate scores, paste the full job description on the Job tab and regenerate.
              </div>
            )}
            {typeof score === "number" && (
              <details style={{ marginBottom: 16, background: P.field, border: `1px solid ${P.glassBorder}`, borderRadius: 12, padding: "10px 13px" }}>
                <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 600, color: P.ink, display: "flex", alignItems: "center", gap: 8 }}>
                  <span>See the numbers behind this</span>
                  <span style={{ fontSize: 11.5, fontWeight: 400, color: P.muted }}>AI fit {score} · keyword coverage {coverage ? coverage.pct + "%" : "—"}</span>
                </summary>
                <div style={{ marginTop: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ width: 52, height: 52, borderRadius: "50%", border: `4px solid ${scoreColor}`, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 17, color: scoreColor }}>{score}</div>
                      <div>
                        <div style={{ fontSize: 12.5, fontWeight: 700 }}>Overall fit (AI)</div>
                        <div style={{ fontSize: 11, color: P.faint }}>a judgement call — rough guide, not exact</div>
                      </div>
                    </div>
                    {coverage ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <div style={{ width: 52, height: 52, borderRadius: "50%", border: `4px solid ${coverage.pct >= 70 ? P.ok : coverage.pct >= 45 ? P.warn : P.danger}`, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 15, color: coverage.pct >= 70 ? P.ok : coverage.pct >= 45 ? P.warn : P.danger }}>{coverage.pct}%</div>
                        <div>
                          <div style={{ fontSize: 12.5, fontWeight: 700 }}>Job words your resume actually uses</div>
                          <div style={{ fontSize: 11, color: P.faint }}>{coverage.matched.length} of {coverage.matched.length + coverage.missing.length} key terms · {coverage.fromAI ? "AI estimate" : "exact count"}</div>
                        </div>
                      </div>
                    ) : (
                      <div style={{ fontSize: 11.5, color: P.faint, maxWidth: 260, lineHeight: 1.5 }}>
                        Keyword coverage needs the job description text in the box on the Job tab. If you uploaded the JD as an image, the text may not have carried over — paste the JD text and regenerate to see this.
                      </div>
                    )}
                  </div>
                  {result.scoreBreakdown && (
                    <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                      {[["Skills & tools overlap", result.scoreBreakdown.keywordMatch], ["How relevant your experience is", result.scoreBreakdown.experienceRelevance], ["Seniority level fit", result.scoreBreakdown.seniorityFit]].map(([label, val]) => typeof val === "number" && (
                        <div key={label} style={{ flex: "1 1 150px", background: "rgba(255,255,255,0.04)", border: `1px solid ${P.glassBorder}`, borderRadius: 10, padding: "8px 11px" }}>
                          <div style={{ fontSize: 11, color: P.muted }}>{label}</div>
                          <div style={{ fontSize: 16, fontWeight: 700, color: val >= 75 ? P.ok : val >= 50 ? P.warn : P.danger }}>{val}</div>
                          <div style={{ height: 4, background: "rgba(255,255,255,0.1)", borderRadius: 4, marginTop: 4, overflow: "hidden" }}><div style={{ height: "100%", width: `${val}%`, background: val >= 75 ? P.ok : val >= 50 ? P.warn : P.danger }} /></div>
                        </div>
                      ))}
                    </div>
                  )}
                  {result.scoreRationale && (
                    <div style={{ fontSize: 12.5, color: P.muted, marginTop: 10, lineHeight: 1.55 }}><strong style={{ color: P.ink }}>The reasoning:</strong> {result.scoreRationale}</div>
                  )}
                </div>
              </details>
            )}
            {result.improvements?.length > 0 && (
              <div style={{ background: P.accentSoft, borderRadius: 12, padding: "11px 13px", marginBottom: 16 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: P.accentDeep, marginBottom: 6 }}>What would make you a stronger candidate here</div>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, lineHeight: 1.7 }}>{result.improvements.map((s, i) => <li key={i}>{s}</li>)}</ul>
                <div style={{ fontSize: 11.5, color: P.faint, marginTop: 8 }}>Tip: paste any of these into Custom instructions on the Job tab, then regenerate.</div>
              </div>
            )}
            {result.gapAnalysis?.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <SectionLabel>Bridging the gaps — honestly</SectionLabel>
                <div style={{ fontSize: 12, color: P.muted, marginBottom: 10, lineHeight: 1.5 }}>
                  Things the job asks for that aren't clearly in your profile yet — and the honest way to handle each. None of this is auto-added to your resume; you decide what's true for you.
                </div>
                {["adjacent", "learnable", "genuine-gap"].map((st) => {
                  const items = result.gapAnalysis.filter((g) => g.status === st);
                  if (!items.length) return null;
                  const meta = st === "adjacent"
                    ? { c: P.ok, title: "You've basically done this — just say it right", sub: "You have real, related experience. Frame it like this (don't claim the tool itself unless you've actually used it):" }
                    : st === "learnable"
                    ? { c: P.warn, title: "You could genuinely pick this up fast", sub: "Not yours yet, but a short focused effort gets you a real beginner level you can defend — then it's honestly yours:" }
                    : { c: P.danger, title: "Real gaps — don't fake these", sub: "No honest bridge right now. Leave them off, but know they're the weak spots if you do apply:" };
                  return (
                    <div key={st} style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: meta.c, marginBottom: 4 }}>{meta.title}</div>
                      <div style={{ fontSize: 11.5, color: P.faint, marginBottom: 8 }}>{meta.sub}</div>
                      {items.map((g, i) => (
                        <div key={i} style={{ border: `1px solid ${P.glassBorder}`, borderRadius: 10, padding: "9px 12px", marginBottom: 6, background: P.field }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: P.ink }}>{g.keyword}</div>
                          {g.honestBridge && <div style={{ fontSize: 12.5, color: P.muted, marginTop: 3, lineHeight: 1.5 }}>{g.honestBridge}</div>}
                        </div>
                      ))}
                    </div>
                  );
                })}
                <div style={{ fontSize: 11.5, color: P.faint, marginTop: 4, lineHeight: 1.5 }}>
                  If a bridge reflects something you genuinely did, add it to your profile on the Profile tab and regenerate — then it's real and it'll count.
                </div>
              </div>
            )}
            {pageOverflow && (
              <div style={{ background: P.warnSoft, border: `1px solid #f0d5a0`, borderRadius: 12, padding: "10px 12px", fontSize: 13, marginBottom: 14, color: P.warn }}>
                <strong>⚠ Estimated {printPages} print pages.</strong> Regenerate with a custom instruction like “cut to one page — drop the weakest bullet from each role,” or trim a project.
              </div>
            )}
            <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
              <button style={{ ...tabBtn(true), padding: "10px 18px" }} onClick={printAtsPdf}>⬇ ATS PDF</button>
              <button style={{ ...tabBtn(false), padding: "10px 18px" }} onClick={downloadDocx}>⬇ Word (.docx)</button>
              <button title="Convenient visual export; ATS PDF is safer for applications" style={{ ...tabBtn(false), padding: "10px 18px" }} onClick={downloadPdf}>Visual PDF</button>
              <button style={{ ...tabBtn(false), padding: "10px 18px" }} onClick={downloadTex}>⬇ .tex</button>
              <button style={{ ...tabBtn(false), padding: "10px 18px", opacity: clLoading ? 0.6 : 1 }} onClick={genCoverLetter} disabled={clLoading}>{clLoading ? "Writing…" : "✦ Cover letter"}</button>
              <a href="https://www.overleaf.com" target="_blank" rel="noreferrer" style={{ ...tabBtn(false), padding: "10px 18px", textDecoration: "none", display: "inline-block" }}>Overleaf ↗</a>
              <button style={{ ...tabBtn(false), padding: "10px 18px" }} onClick={() => setEditingResult((v) => !v)}>{editingResult ? "Done editing" : "✎ Edit resume"}</button>
              <button style={{ ...tabBtn(false), padding: "10px 18px" }} onClick={trackApplication}>＋ Track application</button>
            </div>
            {editingResult && <ResultEditor result={result} onChange={updateGenerated} onRegenerate={regenerateSection} regenerating={regeneratingSection} />}
            {result.fabricationWarnings?.length > 0 && (
              <div style={{ background: P.warnSoft, border: `1px solid #f0d5a0`, borderRadius: 12, padding: "10px 12px", fontSize: 13, marginBottom: 14, color: P.warn }}>
                <strong>⚠ Verify before sending:</strong>
                <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>{result.fabricationWarnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
              </div>
            )}
            {!pageOverflow && <div style={{ color: P.ok, fontSize: 12.5, marginBottom: 12 }}>✓ Print-layout check: estimated 1 page at US Letter with 0.5-inch margins.</div>}
            {result.qualityReview && (
              <div style={{ background: result.qualityReview.verdict === "pass" ? "rgba(47,125,87,0.15)" : P.warnSoft, border: `1px solid ${result.qualityReview.verdict === "pass" ? "rgba(127,224,173,0.4)" : "#f0d5a0"}`, borderRadius: 12, padding: "10px 12px", fontSize: 13, marginBottom: 14 }}>
                <strong>{result.qualityReview.verdict === "pass" ? "✓ Independent fact-check passed" : result.qualityReview.verdict === "review" ? "⚠ Independent fact-check needs your review" : "Quality check unavailable"}</strong>
                {result.qualityReview.autoCorrected > 0 && <div style={{ marginTop: 5 }}>Automatically corrected {result.qualityReview.autoCorrected} unsupported claim{result.qualityReview.autoCorrected > 1 ? "s" : ""} using source evidence.</div>}
                {result.qualityReview.corrections?.map((item, i) => <details key={i} style={{ marginTop: 7 }}><summary style={{ cursor: "pointer" }}>{item.original}</summary><div style={{ margin: "5px 0 0 14px", color: P.muted }}><div><strong>Source:</strong> {item.sourceEvidence || "No supporting text found"}</div><div><strong>Correction:</strong> {item.replacement || "Removed"}</div><div><strong>Reason:</strong> {item.reason}</div></div></details>)}
                {result.qualityReview.qualityIssues?.length > 0 && <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>{result.qualityReview.qualityIssues.map((issue, i) => <li key={i}>{issue}</li>)}</ul>}
                {result.qualityReview.error && <div style={{ marginTop: 5, color: P.muted }}>{result.qualityReview.error} Review the resume manually before applying.</div>}
              </div>
            )}
            {result.qualityChecks?.length > 0 && <div style={{ background: P.accentSoft, borderRadius: 12, padding: "10px 12px", fontSize: 13, marginBottom: 14 }}><strong>Resume quality checks</strong><ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>{result.qualityChecks.map((issue, i) => <li key={i}>{issue}</li>)}</ul></div>}
            {result.notes && <div style={{ background: P.accentSoft, borderRadius: 12, padding: "10px 12px", fontSize: 13, marginBottom: 14 }}><strong>What the AI emphasized:</strong> {result.notes}</div>}
            <Row>
              {result.keywordsMatched?.length > 0 && (
                <div style={{ flex: "1 1 45%", marginBottom: 12 }}><SectionLabel>✓ Covered</SectionLabel>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{result.keywordsMatched.map((k, i) => <span key={i} style={{ background: "rgba(47,125,87,0.12)", color: P.ok, fontSize: 12, fontWeight: 600, padding: "3px 10px", borderRadius: 20 }}>{k}</span>)}</div>
                </div>
              )}
              {result.keywordsMissing?.length > 0 && (
                <div style={{ flex: "1 1 45%", marginBottom: 12 }}><SectionLabel>✗ Missing</SectionLabel>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{result.keywordsMissing.map((k, i) => <span key={i} style={{ background: P.dangerSoft, color: P.danger, fontSize: 12, fontWeight: 600, padding: "3px 10px", borderRadius: 20 }}>{k}</span>)}</div>
                </div>
              )}
            </Row>
            {coverLetter && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><SectionLabel>Cover letter</SectionLabel><button style={{ ...tabBtn(false), padding: "4px 12px", fontSize: 12 }} onClick={() => { navigator.clipboard?.writeText(coverLetter); setStatus("Cover letter copied."); }}>Copy</button></div>
                <div style={{ border: `1px solid rgba(109,78,201,0.2)`, borderRadius: 12, background: "rgba(255,255,255,0.7)", padding: 16, fontSize: 13, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{coverLetter}</div>
              </div>
            )}
            <SectionLabel>Live preview — exactly what your PDF looks like (links are clickable)</SectionLabel>
            <div ref={previewRef} style={{ border: `1px solid rgba(109,78,201,0.15)`, borderRadius: 12, background: "#fff", padding: 30, fontSize: 12.5, lineHeight: 1.5, color: "#111" }} dangerouslySetInnerHTML={{ __html: renderResumeInner(result) }} />
            <details style={{ marginTop: 16 }}><summary style={{ cursor: "pointer", fontWeight: 600, fontSize: 13, color: P.muted }}>View LaTeX source</summary>
              <pre style={{ background: "#1a1330", color: "#d9cff5", padding: 14, borderRadius: 12, fontSize: 11.5, overflow: "auto", marginTop: 8, whiteSpace: "pre-wrap" }}>{tex}</pre>
            </details>
          </div>
        )}
 
        {tab === "prep" && (
          <div style={glassCard}>
            <SectionLabel>🎤 Interview prep</SectionLabel>
            <div style={{ fontSize: 12.5, color: P.muted, marginBottom: 12 }}>
              Generates likely questions and answers grounded in your saved profile. Uses the job description below — or the last one you generated a resume for.
            </div>
            <textarea value={prepJd} onChange={(e) => setPrepJd(e.target.value)} rows={6}
              placeholder={jd.trim() ? "Leave blank to reuse your last job description, or paste a different one here…" : "Paste the job description you're interviewing for…"}
              style={{ width: "100%", padding: "11px 13px", fontSize: 13, fontFamily: font, border: `1px solid ${P.fieldBorder}`, borderRadius: 12, background: P.field, boxSizing: "border-box", resize: "vertical", color: P.ink, outline: "none" }} />
            <button style={{ ...tabBtn(true), padding: "12px 24px", marginTop: 12, opacity: prepLoading ? 0.6 : 1 }} onClick={genPrep} disabled={prepLoading}>{prepLoading ? "Preparing…" : "✦ Generate interview prep"}</button>
 
            {prep && (
              <div style={{ marginTop: 20 }}>
                {prep.focusAreas?.length > 0 && (
                  <div style={{ background: P.warnSoft, border: `1px solid #f0d5a0`, borderRadius: 12, padding: "10px 12px", fontSize: 13, marginBottom: 16, color: P.warn }}>
                    <strong>Brush up before the interview:</strong> {prep.focusAreas.join(" · ")}
                  </div>
                )}
                {prep.technical?.length > 0 && (
                  <div style={{ marginBottom: 18 }}>
                    <SectionLabel>Technical questions</SectionLabel>
                    {prep.technical.map((qa, i) => <QA key={i} q={qa.q} a={qa.a} />)}
                  </div>
                )}
                {prep.behavioral?.length > 0 && (
                  <div style={{ marginBottom: 18 }}>
                    <SectionLabel>Behavioral questions</SectionLabel>
                    {prep.behavioral.map((qa, i) => <QA key={i} q={qa.q} a={qa.a} />)}
                  </div>
                )}
                {prep.askThem?.length > 0 && (
                  <div>
                    <SectionLabel>Smart questions to ask them</SectionLabel>
                    <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.7 }}>{prep.askThem.map((q, i) => <li key={i}>{q}</li>)}</ul>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
 
        {tab === "history" && (
          <div style={glassCard}>
            <SectionLabel>Your generated resumes</SectionLabel>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
              <button style={tabBtn(false)} onClick={exportBackup}>⬇ Export backup</button>
              <button style={tabBtn(false)} onClick={() => backupFileRef.current?.click()}>⬆ Restore backup</button>
              <input ref={backupFileRef} type="file" accept="application/json,.json" hidden onChange={importBackup} />
            </div>
            {history.length === 0 ? <p style={{ fontSize: 13, color: P.muted }}>No resumes yet.</p> :
              history.map((e) => (
                <div key={e.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "11px 13px", border: `1px solid rgba(109,78,201,0.15)`, borderRadius: 12, marginBottom: 8, background: "rgba(255,255,255,0.5)" }}>
                  <div><div style={{ fontWeight: 600, fontSize: 13 }}>{e.label} <span style={{ color: P.muted, fontWeight: 400 }}>· {e.person}</span></div>
                    <div style={{ fontSize: 11.5, color: P.muted }}>{new Date(e.date).toLocaleString()}{typeof e.result?.matchScore === "number" ? ` · match ${e.result.matchScore}` : ""}</div></div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button style={{ ...tabBtn(false), padding: "5px 12px", fontSize: 12 }} onClick={() => openHistory(e)}>Open</button>
                    <button style={{ ...tabBtn(false), padding: "5px 12px", fontSize: 12, color: P.danger }} onClick={() => deleteHistory(e.id)}>Delete</button>
                  </div>
                </div>
              ))}
          </div>
        )}

        {tab === "applications" && (
          <div style={glassCard} className="tracker-shell">
            <div className="tracker-heading">
              <div><SectionLabel>Application tracker</SectionLabel><p>Keep every opportunity and next step in one place.</p></div>
              <span className="tracker-total">{applications.length} {applications.length === 1 ? "application" : "applications"}</span>
            </div>
            {applications.length > 0 && <div className="tracker-summary" aria-label="Application status summary">
              {["Preparing", "Applied", "Interview", "Offer"].map((status) => <div className={`tracker-stat status-${status.toLowerCase()}`} key={status}><strong>{applications.filter((item) => item.status === status).length}</strong><span>{status}</span></div>)}
            </div>}
            {applications.length === 0 ? <div className="tracker-empty"><span aria-hidden="true">◎</span><strong>No applications yet</strong><p>Generate a tailored resume, then choose “Track application.”</p></div> : applications.map((item) => (
              <article key={item.id} className="application-card">
                <div className="application-card-top">
                  <div className="application-identity"><span className="company-mark" aria-hidden="true">{(item.company || item.role || "?").trim().charAt(0).toUpperCase()}</span><div><strong>{item.role || "Untitled role"}</strong><span>{item.company || "Add company"}</span></div></div>
                  <span className={`application-stage status-${item.status.toLowerCase()}`}>{item.status}</span>
                </div>
                <div className="application-fields">
                  <label><span>Company</span><input aria-label="Company" value={item.company} placeholder="Company name" onChange={(e) => updateApplication(item.id, "company", e.target.value)} /></label>
                  <label><span>Role</span><input aria-label="Role" value={item.role} placeholder="Job title" onChange={(e) => updateApplication(item.id, "role", e.target.value)} /></label>
                  <label><span>Status</span><select aria-label="Application status" value={item.status} onChange={(e) => updateApplication(item.id, "status", e.target.value)}>{["Preparing", "Applied", "Interview", "Offer", "Rejected", "Withdrawn"].map((status) => <option key={status}>{status}</option>)}</select></label>
                  <label><span>Date</span><input aria-label="Application date" type="date" value={item.date} onChange={(e) => updateApplication(item.id, "date", e.target.value)} /></label>
                </div>
                <label className="application-notes"><span>Notes & next step</span><textarea aria-label="Application notes" value={item.notes} onChange={(e) => updateApplication(item.id, "notes", e.target.value)} placeholder="Recruiter contact, follow-up date, interview notes…" rows={2} /></label>
                <div className="application-actions">{typeof item.matchScore === "number" && <span>Resume match <strong>{item.matchScore}%</strong></span>}<button className="application-delete" onClick={() => setApplications((items) => items.filter((app) => app.id !== item.id))}>Delete application</button></div>
              </article>
            ))}
          </div>
        )}
 
        <p style={{ textAlign: "center", color: P.muted, fontSize: 11.5, marginTop: 30 }}>Saved data stays in your browser. AI requests are relayed to Google Gemini without storage. No tracking.</p>
      </div>
    </div>
  );
}
 
function fileToBase64(file) { return new Promise((res, rej) => { const rd = new FileReader(); rd.onload = () => res(rd.result.split(",")[1]); rd.onerror = rej; rd.readAsDataURL(file); }); }
function deriveLabel(jd) { const f = (jd || "").split("\n").find((l) => l.trim().length > 3); return (f || "Untitled job").trim().slice(0, 60); }
 
// ─── Deterministic ATS keyword match (no AI — reproducible) ─────────────────
// Flattens the tailored resume into plain text, then checks which of the
// job's important keywords literally appear in it. This is a real, repeatable
// number that sits next to the AI's fuzzy matchScore.
const STOPWORDS = new Set("a an and are as at be by for from has have in is it its of on or that the to with will your you we our their they this these those must should can able strong excellent proven track record etc using use used work working experience years year role team teams ability across including etc".split(" "));
function normalizeText(s) {
  return (s || "").toLowerCase()
    .replace(/[^a-z0-9+#.\s]/g, " ")   // keep + # . (c++, c#, node.js)
    .replace(/\s+/g, " ");
}
function singularize(w) {
  if (w.length > 4 && w.endsWith("ies")) return w.slice(0, -3) + "y"; // pipelines-style not affected; libraries->library
  if (w.length > 3 && w.endsWith("es")) return w.slice(0, -2);        // processes->process
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1); // pipelines->pipeline
  return w;
}
function resumeToPlainText(r) {
  const parts = [r.summary, r.skills];
  (r.experienceStructured || []).forEach((e) => { parts.push(e.role, e.company, ...(e.bullets || [])); });
  (r.projectsStructured || []).forEach((p) => { parts.push(p.name, p.tech, ...(p.bullets || [])); });
  (r.educationStructured || []).forEach((e) => { parts.push(e.degree, e.school); });
  (r.certificationsStructured || []).forEach((c) => parts.push(c.name));
  // normalized text + a "despaced" copy so "Power BI" matches "powerbi"
  const norm = normalizeText(parts.filter(Boolean).join(" "));
  return { norm, despaced: norm.replace(/\s+/g, "") };
}
// A curated vocabulary of skills/tools/technologies that actually matter for
// ATS keyword matching. Frequency-ranking picks JD boilerplate ("passionate",
// "stakeholder") instead of real skills, so we match against this list plus
// multi-word tech phrases detected in the JD.
const SKILL_VOCAB = [
  "sql","python","r","java","scala","javascript","typescript","bash","c++","c#","go","rust",
  "bigquery","snowflake","redshift","databricks","postgres","postgresql","mysql","mongodb","cassandra","oracle","sqlite",
  "dbt","airflow","dagster","prefect","luigi","spark","hadoop","kafka","flink","beam","hive","presto","trino",
  "etl","elt","pipeline","warehouse","warehousing","lakehouse","data lake","data modeling","data modelling",
  "gcp","aws","azure","cloud run","cloud functions","lambda","s3","gcs","ec2","bigtable","pub/sub","dataflow","dataproc","glue","athena","emr","kinesis",
  "tableau","power bi","powerbi","looker","looker studio","data studio","qlik","superset","metabase","grafana",
  "ga4","google analytics","google ad manager","gam","marfeel","parse.ly","segment","mixpanel","amplitude",
  "pandas","numpy","scipy","scikit-learn","sklearn","statsmodels","tensorflow","pytorch","keras","xgboost",
  "machine learning","statistics","statistical analysis","hypothesis testing","regression","forecasting","a/b testing","ab testing","experimentation",
  "docker","kubernetes","terraform","ci/cd","git","github","gitlab","jenkins","cloud scheduler",
  "excel","vba","google sheets","dax","m query","power query",
  "api","rest","graphql","json","yaml","etl pipeline","data quality","data governance","dashboard","reporting","visualization","visualisation",
  "partitioning","clustering","incremental","microbatch","orchestration","automation","monitoring","alerting",
];
function extractJdKeywords(jd) {
  const norm = normalizeText(jd);
  const despaced = norm.replace(/\s+/g, "");
  const found = new Set();
  for (const skill of SKILL_VOCAB) {
    const s = skill.toLowerCase();
    // multi-word (has space or is a known despaced form) → substring; single word → token boundary
    if (s.includes(" ") || s.includes("/") || s.includes(".") || s.includes("+") || s.includes("#") || s.includes("-")) {
      if (norm.includes(s) || despaced.includes(s.replace(/\s+/g, ""))) found.add(skill);
    } else {
      const re = new RegExp(`(^|\\s)${s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(s|es)?(\\s|$)`);
      if (re.test(norm)) found.add(skill);
    }
  }
  return [...found];
}
export function computeKeywordCoverage(resume, jd) {
  const { norm, despaced } = resumeToPlainText(resume);
  const kws = extractJdKeywords(jd);
  if (kws.length < 3) return null; // too few real skills detected to be meaningful
  const matched = [], missing = [];
  for (const k of kws) {
    const s = k.toLowerCase();
    const hit = s.includes(" ") || s.includes("/") || s.includes(".") || s.includes("+") || s.includes("#") || s.includes("-")
      ? (norm.includes(s) || despaced.includes(s.replace(/\s+/g, "")))
      : new RegExp(`(^|\\s)${s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(s|es)?(\\s|$)`).test(norm);
    (hit ? matched : missing).push(k);
  }
  return { matched, missing, pct: Math.round((matched.length / kws.length) * 100) };
}
export function rankProjectsByRelevance(projects, jd) {
  const terms = new Set(normalizeText(jd).split(" ").filter((term) => term.length > 2 && !STOPWORDS.has(term)));
  const score = (project) => normalizeText([project.name, project.tech, ...(project.bullets || [])].join(" ")).split(" ").reduce((total, term) => total + (terms.has(term) ? 1 : 0), 0);
  return [...(projects || [])].map((project, index) => ({ project, index, score: score(project) })).sort((a, b) => b.score - a.score || a.index - b.index).map(({ project }) => project);
}
export function applyEvidenceCorrections(resume, corrections) {
  let applied = 0; const appliedOriginals = new Set();
  const fix = (value) => {
    let text = asString(value);
    for (const item of corrections || []) if (item.original && text.includes(item.original)) { text = text.replace(item.original, item.replacement || "").replace(/\s{2,}/g, " ").trim(); applied++; appliedOriginals.add(item.original); }
    return text;
  };
  const next = { ...resume, summary: fix(resume.summary), skills: normalizeSkills(fix(resume.skills)) };
  next.experienceStructured = (resume.experienceStructured || []).map((item) => ({ ...item, role: fix(item.role), company: fix(item.company), bullets: (item.bullets || []).map(fix).filter(Boolean) }));
  next.projectsStructured = (resume.projectsStructured || []).map((item) => ({ ...item, name: fix(item.name), tech: fix(item.tech), bullets: (item.bullets || []).map(fix).filter(Boolean) }));
  return { resume: next, applied, appliedOriginals: [...appliedOriginals] };
}
export function runResumeQualityChecks(resume) {
  const issues = [];
  const bullets = [...(resume.experienceStructured || []), ...(resume.projectsStructured || [])].flatMap((item) => item.bullets || []);
  const weak = bullets.filter((bullet) => /^(responsible for|helped|worked on|assisted with|tasked with)\b/i.test(bullet));
  const long = bullets.filter((bullet) => bullet.trim().split(/\s+/).length > 32);
  const quantified = bullets.filter((bullet) => /\b\d+(?:\.\d+)?%?|\$\d|\b\d+\s*(?:hours?|days?|users?|clients?|teams?|regions?|hubs?)\b/i.test(bullet));
  const normalized = bullets.map((bullet) => normalizeText(bullet).split(" ").slice(0, 7).join(" "));
  if (weak.length) issues.push(`${weak.length} bullet${weak.length > 1 ? "s" : ""} start with weak phrasing.`);
  if (long.length) issues.push(`${long.length} bullet${long.length > 1 ? "s are" : " is"} longer than 32 words.`);
  if (bullets.length >= 4 && quantified.length / bullets.length < 0.2) issues.push("Fewer than 20% of bullets contain measurable scope or outcomes; add metrics only where truthful.");
  if (new Set(normalized).size < normalized.length) issues.push("Two or more bullets begin with substantially repeated wording.");
  if ((resume.summary || "").split(/\s+/).filter(Boolean).length > 55) issues.push("Summary exceeds 55 words.");
  if (normalizeSkills(resume.skills).split(",").filter(Boolean).length > 24) issues.push("Skills section has more than 24 entries and may look keyword-stuffed.");
  return issues;
}
function Row({ children }) { return <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>{children}</div>; }
function SectionLabel({ children }) { return <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", color: P.accentDeep, margin: "14px 0 8px" }}>{children}</div>; }
function QA({ q, a }) {
  const [open, setOpen] = React.useState(false);
  return (
    <div style={{ border: `1px solid ${P.glassBorder}`, borderRadius: 12, marginBottom: 8, background: "rgba(255,255,255,0.04)", overflow: "hidden" }}>
      <button onClick={() => setOpen((o) => !o)} style={{ width: "100%", textAlign: "left", padding: "11px 14px", background: "transparent", border: "none", color: P.ink, fontSize: 13.5, fontWeight: 600, fontFamily: font, cursor: "pointer", display: "flex", justifyContent: "space-between", gap: 10 }}>
        <span>{q}</span><span style={{ color: P.accent, flexShrink: 0 }}>{open ? "−" : "+"}</span>
      </button>
      {open && <div style={{ padding: "0 14px 12px", fontSize: 13, lineHeight: 1.65, color: P.muted, whiteSpace: "pre-wrap" }}>{a}</div>}
    </div>
  );
}
function Spinner() { return <span style={{ width: 13, height: 13, border: `2px solid rgba(109,78,201,0.25)`, borderTopColor: P.accent, borderRadius: "50%", display: "inline-block", animation: "spin 0.7s linear infinite" }}><style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style></span>; }

function ResultEditor({ result, onChange, onRegenerate, regenerating }) {
  const editBullet = (section, row, bullet, value) => {
    const next = { ...result, [section]: result[section].map((item, i) => i === row ? { ...item, bullets: item.bullets.map((b, j) => j === bullet ? value : b) } : item) };
    onChange(next);
  };
  const inputStyle = { width: "100%", boxSizing: "border-box", padding: "8px 10px", marginBottom: 8, borderRadius: 9, border: `1px solid ${P.fieldBorder}`, background: P.field, color: P.ink, font: `13px ${font}` };
  return <div style={{ ...glassCard, padding: 15, marginBottom: 16 }}>
    <SectionLabel>Edit generated resume</SectionLabel>
    <textarea aria-label="Resume summary" rows={3} style={inputStyle} value={result.summary || ""} onChange={(e) => onChange({ ...result, summary: e.target.value })} />
    <textarea aria-label="Resume skills" rows={2} style={inputStyle} value={result.skills || ""} onChange={(e) => onChange({ ...result, skills: e.target.value })} />
    {["experienceStructured", "projectsStructured"].map((section) => <div key={section} style={{ marginTop: 12 }}>
      <button disabled={Boolean(regenerating)} onClick={() => onRegenerate(section)} style={{ ...tabBtn(false), padding: "5px 10px", fontSize: 11.5, marginBottom: 5 }}>
        {regenerating === section ? "Improving…" : `✦ Improve ${section === "experienceStructured" ? "experience" : "projects"}`}
      </button>
      {(result[section] || []).map((item, row) => <div key={`${section}-${row}`} style={{ marginTop: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 5 }}>{item.role || item.name || `Item ${row + 1}`}</div>
        {(item.bullets || []).map((bullet, i) => <textarea key={i} aria-label={`Bullet ${i + 1}`} rows={2} style={inputStyle} value={bullet} onChange={(e) => editBullet(section, row, i, e.target.value)} />)}
      </div>)}
    </div>)}
    <div style={{ fontSize: 11.5, color: P.faint }}>Edits immediately update both PDF and LaTeX exports.</div>
  </div>;
}

function renderResumeInner(r) {
  const e2 = (s = "") => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  const link = (href, label, mail = false) => {
    const safe = mail ? `mailto:${String(href).replace(/[\r\n"'<>]/g, "")}` : safeWebUrl(href);
    return safe ? `<a href="${e2(safe)}" style="color:#4a2f9e;text-decoration:none">${e2(label)}</a>` : e2(label);
  };
  const contactParts = [
    r.email && link(r.email, r.email, true), r.phone && e2(r.phone), r.location && e2(r.location),
    r.linkedin && link(r.linkedin, displayWebUrl(r.linkedin)), r.github && link(r.github, displayWebUrl(r.github)), r.website && link(r.website, displayWebUrl(r.website)),
  ].filter(Boolean);
  const sec = (t, body) => body ? `<h2 style="font-size:13px;border-bottom:1px solid #333;margin:12px 0 6px;padding-bottom:2px;text-transform:uppercase;letter-spacing:1px">${t}</h2>${body}` : "";
  const exp = (r.experienceStructured || []).map((e) => `<div style="margin-bottom:8px"><div style="display:flex;justify-content:space-between"><strong>${e2(e.role)}</strong><span>${e2(e.dates)}</span></div><div style="font-style:italic;color:#333">${e2(e.company)}${e.location ? ", " + e2(e.location) : ""}</div><ul style="margin:4px 0 0;padding-left:18px">${(e.bullets || []).map((b) => `<li>${e2(b)}</li>`).join("")}</ul></div>`).join("");
  const proj = (r.projectsStructured || []).map((p) => { const nm = p.link ? link(p.link, p.name) : `<strong>${e2(p.name)}</strong>`; const nmb = p.link ? `<strong>${nm}</strong>` : nm; return `<div style="margin-bottom:6px">${nmb}${p.tech ? ` <span style="color:#555">(${e2(p.tech)})</span>` : ""}<ul style="margin:3px 0 0;padding-left:18px">${(p.bullets || []).map((b) => `<li>${e2(b)}</li>`).join("")}</ul></div>`; }).join("");
  const edu = (r.educationStructured || []).map((e) => `<div style="display:flex;justify-content:space-between"><span><strong>${e2(e.degree)}</strong>, ${e2(e.school)}${e.location ? ", " + e2(e.location) : ""}</span><span>${e2(e.dates)}</span></div>`).join("");
  const certs = (r.certificationsStructured || []).length
    ? r.certificationsStructured.map((c) => `<div style="margin-bottom:2px">${c.link ? link(c.link, c.name) : e2(c.name)}</div>`).join("")
    : (r.certifications ? `<div>${e2(r.certifications)}</div>` : "");
  return `<div style="text-align:center;margin-bottom:8px"><div style="font-size:20px;font-weight:800">${e2(r.name)}</div>${r.title ? `<div style="font-size:13px">${e2(r.title)}</div>` : ""}<div style="font-size:11px;color:#333;margin-top:3px">${contactParts.join(" &bull; ")}</div></div>${sec("Summary", r.summary ? `<div>${e2(r.summary)}</div>` : "")}${sec("Skills", r.skills ? `<div>${e2(r.skills)}</div>` : "")}${sec("Experience", exp)}${sec("Projects", proj)}${sec("Education", edu)}${sec("Certifications", certs)}`;
}
 












