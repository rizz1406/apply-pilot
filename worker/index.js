import { scanSources } from "./discovery.js";
import { prepareApplication } from "./ai.js";
import { sendNotificationEmail, sendOutreach, syncApplicationConfirmations, syncJobAlertEmails, syncRecruiterReplies } from "./gmail.js";
import { scoreJob } from "./matching.js";
import { notify } from "./notifications.js";
import { contentHash, createTailoredPack } from "./resume-tailor.js";
import { evaluateApplicationGate } from "./quality-gate.js";
import { createInterviewPrep } from "./application-tools.js";
import { atsReadiness, checklistDefaults, mergeVerifiedEvidence, resumeDiff, validateRevisionInstruction } from "./resume-workflow.js";
import { authorizeRequest } from "./access-auth.js";
import { runMatchingEvaluation } from "./evaluation.js";
import { rebuildPreferenceWeights } from "./preference-learning.js";
import { selectProjects } from "./project-selector.js";
import { aiBudgetStatus, recordAiUsage } from "./ai-budget.js";
import { enqueueTask, runQueuedTask } from "./task-queue.js";

const json = (data, status = 200, extra = {}) => new Response(JSON.stringify(data), {
  status,
  headers: { "Content-Type": "application/json; charset=utf-8", ...extra }
});

const cors = (env, request) => {
  const requestOrigin = request?.headers.get("Origin") || "";
  const isApplyPilotOrigin = requestOrigin === env.APP_ORIGIN || /^https:\/\/[a-z0-9-]+\.applypilot\.pages\.dev$/i.test(requestOrigin);
  return {
  "Access-Control-Allow-Origin": isApplyPilotOrigin ? requestOrigin : (env.APP_ORIGIN || "*"),
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Vary": "Origin"
  };
};

function pathMatch(pathname, pattern) {
  const names = [];
  const expression = pattern.replace(/:([^/]+)/g, (_, name) => { names.push(name); return "([^/]+)"; });
  const match = pathname.match(new RegExp(`^${expression}$`));
  if (!match) return null;
  return Object.fromEntries(names.map((name, index) => [name, decodeURIComponent(match[index + 1])]));
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  try { const parsed = JSON.parse(value || "[]"); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
}

async function activity(env, type, message, entityType = null, entityId = null, metadata = {}) {
  await env.DB.prepare("INSERT INTO activity_log (event_type, entity_type, entity_id, message, metadata) VALUES (?, ?, ?, ?, ?)")
    .bind(type, entityType, entityId, message, JSON.stringify(metadata)).run();
}

async function ensureChecklist(env, applicationId, provider = "Portal") {
  await env.DB.batch(checklistDefaults(provider).map(item => env.DB.prepare(`INSERT OR IGNORE INTO application_checklist (application_id, item_key, label, required, completed)
    VALUES (?, ?, ?, ?, ?)`)
    .bind(applicationId, item.item_key, item.label, item.required, ["jd_reviewed", "resume_tailored"].includes(item.item_key) ? 1 : 0)));
}

async function saveResumeVersion(env, applicationId, tailoredId, pack, instruction = "", before = {}) {
  const latest = await env.DB.prepare("SELECT MAX(version_number) AS number FROM resume_versions WHERE application_id = ?").bind(applicationId).first();
  const version = Number(latest?.number || 0) + 1;
  const diff = resumeDiff(before, pack.resume);
  const readiness = atsReadiness(pack.resume, pack.coverage, pack.audit);
  await env.DB.prepare(`INSERT INTO resume_versions (id, application_id, tailored_resume_id, version_number, instruction, resume_json, audit_json, keyword_coverage, latex_content, model, change_summary)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(crypto.randomUUID(), applicationId, tailoredId, version, instruction, JSON.stringify(pack.resume), JSON.stringify(pack.audit), JSON.stringify(pack.coverage), pack.latex, pack.model, JSON.stringify({ ...diff, atsReadiness: readiness })).run();
  return { version, diff, readiness };
}

async function saveDocumentVersion(env, applicationId, tailoredId, kind, content, mimeType) {
  const latest = await env.DB.prepare("SELECT MAX(version_number) AS number FROM document_versions WHERE application_id=? AND kind=?").bind(applicationId, kind).first();
  const version = Number(latest?.number || 0) + 1;
  await env.DB.prepare(`INSERT INTO document_versions (id, application_id, tailored_resume_id, kind, version_number, content, mime_type, checksum)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(crypto.randomUUID(), applicationId, tailoredId, kind, version, content || "", mimeType, await contentHash(content || "")).run();
  return version;
}

async function createBudgetedPack(env, profile, job, options = {}) {
  const budget = await aiBudgetStatus(env);
  const aiEnv = budget.remaining > 0 ? env : { ...env, AI: null, GEMINI_API_KEY: "" };
  try {
    const pack = await createTailoredPack(aiEnv, profile, job, options);
    if (pack.model !== "deterministic-fallback") await recordAiUsage(env, pack.model, "resume_pack");
    return { ...pack, budgetFallback: budget.remaining <= 0 };
  } catch (error) {
    await recordAiUsage(env, "provider", "resume_pack", true);
    throw error;
  }
}

async function saveProjectSelections(env, job, evidence) {
  const normalized = evidence.map(item => {
    let details = {};
    try { details = JSON.parse(item.details_json || "{}"); } catch {}
    return { ...item, ...details };
  });
  const selected = selectProjects(job, normalized);
  await env.DB.prepare("DELETE FROM job_project_selections WHERE job_id=?").bind(job.id).run();
  if (selected.length) await env.DB.batch(selected.map(item => env.DB.prepare(`INSERT INTO job_project_selections
    (job_id, evidence_id, relevance_score, reason) VALUES (?, ?, ?, ?)`)
    .bind(job.id, item.id, item.relevanceScore, item.reason)));
  return selected;
}

async function bootstrap(env) {
  const [settings, profile, jobs, applications, outreach, activities, standardSources, externalSources, leads, resumeVariants, analytics, contacts, roleAnalytics, sourceAnalytics, answers, interviews] = await Promise.all([
    env.DB.prepare("SELECT * FROM settings WHERE id = 1").first(),
    env.DB.prepare("SELECT * FROM candidate_profile WHERE id = 1").first(),
    env.DB.prepare("SELECT * FROM jobs WHERE status IN ('new','shortlisted') ORDER BY score DESC, discovered_at DESC LIMIT 100").all(),
    env.DB.prepare(`SELECT a.*, j.title, j.company, j.score, j.apply_url, j.description, j.opportunity_type,
      t.resume_json AS tailored_resume_json, t.audit_json AS resume_audit_json, t.keyword_coverage, t.match_score AS tailored_match_score, t.latex_content, t.status AS tailored_status, t.model AS tailored_model
      FROM applications a JOIN jobs j ON j.id = a.job_id LEFT JOIN tailored_resumes t ON t.id = a.tailored_resume_id
      ORDER BY a.updated_at DESC LIMIT 100`).all(),
    env.DB.prepare(`SELECT o.*, j.title AS role, j.company FROM outreach o JOIN applications a ON a.id = o.application_id JOIN jobs j ON j.id = a.job_id ORDER BY o.updated_at DESC LIMIT 100`).all(),
    env.DB.prepare("SELECT * FROM activity_log ORDER BY created_at DESC LIMIT 20").all(),
    env.DB.prepare("SELECT * FROM sources ORDER BY label").all(),
    env.DB.prepare("SELECT * FROM external_sources ORDER BY label").all(),
    env.DB.prepare("SELECT * FROM job_leads WHERE status IN ('new','opened') ORDER BY discovered_at DESC LIMIT 100").all(),
    env.DB.prepare("SELECT * FROM resume_variants ORDER BY is_default DESC, name").all(),
    env.DB.prepare(`SELECT
      (SELECT COUNT(*) FROM jobs) AS discovered,
      (SELECT COUNT(*) FROM jobs WHERE status = 'approved') AS approved,
      (SELECT COUNT(*) FROM applications WHERE stage = 'applied') AS applied,
      (SELECT COUNT(*) FROM applications WHERE stage IN ('interview','offer')) AS interviews,
      (SELECT COUNT(*) FROM applications WHERE stage = 'offer') AS offers,
      (SELECT COUNT(*) FROM applications WHERE stage = 'rejected') AS rejected,
      (SELECT COUNT(*) FROM tailored_resumes) AS tailored_packs`).first(),
    env.DB.prepare("SELECT name, email, source_url, verified FROM recruiter_contacts ORDER BY verified DESC, created_at DESC LIMIT 100").all(),
    env.DB.prepare(`SELECT j.title AS label, COUNT(*) AS applications,
      SUM(CASE WHEN a.stage IN ('interview','offer') THEN 1 ELSE 0 END) AS interviews
      FROM applications a JOIN jobs j ON j.id = a.job_id GROUP BY j.title ORDER BY applications DESC, interviews DESC LIMIT 8`).all(),
    env.DB.prepare(`SELECT j.provider AS label, COUNT(*) AS applications,
      SUM(CASE WHEN a.stage IN ('interview','offer') THEN 1 ELSE 0 END) AS interviews
      FROM applications a JOIN jobs j ON j.id = a.job_id GROUP BY j.provider ORDER BY applications DESC, interviews DESC LIMIT 8`).all(),
    env.DB.prepare("SELECT key, label, value, verified FROM application_answers ORDER BY label").all(),
    env.DB.prepare("SELECT application_id, scheduled_at, notes, prep_json, updated_at FROM interview_workspaces").all()
  ]);
  const [evidence, versions, checklist, sourceHealth, taskRuns, notifications, evaluation, documentVersions, atsSources, feedback, appEvents, queuedTasks, aiUsage, projectSelections] = await Promise.all([
    env.DB.prepare("SELECT * FROM verified_evidence ORDER BY verified DESC, active DESC, updated_at DESC").all(),
    env.DB.prepare("SELECT id, application_id, tailored_resume_id, version_number, instruction, model, change_summary, created_at FROM resume_versions ORDER BY application_id, version_number DESC LIMIT 200").all(),
    env.DB.prepare("SELECT * FROM application_checklist ORDER BY application_id, rowid").all(),
    env.DB.prepare("SELECT * FROM source_scan_runs ORDER BY created_at DESC LIMIT 100").all(),
    env.DB.prepare("SELECT * FROM task_runs ORDER BY started_at DESC LIMIT 30").all(),
    env.DB.prepare("SELECT * FROM app_notifications ORDER BY created_at DESC LIMIT 50").all(),
    env.DB.prepare("SELECT * FROM accuracy_evaluations ORDER BY created_at DESC LIMIT 1").first(),
    env.DB.prepare("SELECT id, application_id, tailored_resume_id, kind, version_number, mime_type, checksum, created_at FROM document_versions ORDER BY created_at DESC LIMIT 300").all(),
    env.DB.prepare("SELECT * FROM ats_sources ORDER BY label").all(),
    env.DB.prepare("SELECT * FROM job_feedback").all(),
    env.DB.prepare("SELECT * FROM application_events ORDER BY created_at DESC LIMIT 300").all(),
    env.DB.prepare("SELECT * FROM task_queue ORDER BY created_at DESC LIMIT 50").all(),
    env.DB.prepare("SELECT provider, operation, requests, failures FROM ai_usage WHERE usage_date=date('now')").all(),
    env.DB.prepare(`SELECT s.*, e.title FROM job_project_selections s JOIN verified_evidence e ON e.id=s.evidence_id ORDER BY s.relevance_score DESC`).all()
  ]);
  const sources = [
    ...standardSources.results.map(source => ({ ...source, id: `core:${source.id}` })),
    ...externalSources.results.map(source => ({ ...source, id: `external:${source.id}` })),
    ...atsSources.results.map(source => ({ ...source, id: `ats:${source.id}` }))
  ].sort((a, b) => a.label.localeCompare(b.label));
  return { settings, profile, jobs: jobs.results, applications: applications.results, outreach: outreach.results, activity: activities.results, sources, leads: leads.results, resumeVariants: resumeVariants.results, analytics: { ...analytics, byRole: roleAnalytics.results, bySource: sourceAnalytics.results }, contacts: contacts.results, answers: answers.results, interviews: interviews.results, evidence: evidence.results, resumeVersions: versions.results, checklist: checklist.results, sourceHealth: sourceHealth.results, taskRuns: taskRuns.results, notifications: notifications.results, evaluation, documentVersions: documentVersions.results, feedback: feedback.results, applicationEvents: appEvents.results, queuedTasks: queuedTasks.results, aiUsage: aiUsage.results, projectSelections: projectSelections.results, demoMode: env.DEMO_MODE === "true", authMode: env.ACCESS_AUD && env.ACCESS_TEAM_DOMAIN ? "access" : "token" };
}

async function route(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  if (method === "GET" && path === "/api/health") return json({ ok: true, service: "applypilot", time: new Date().toISOString() });
  const auth = await authorizeRequest(request, env);
  if (!auth.authorized) return json({ error: "Unauthorized", authMode: auth.mode }, 401);
  if (method === "GET" && path === "/api/auth/status") return json({ ok: true, mode: auth.mode, identity: auth.identity });
  if (method === "POST" && path === "/api/ai/provider-test") {
    const pack = await createBudgetedPack(env, {
      name: "Test Candidate", title: "Data Analyst", email: "test@example.com", phone: "000", location: "India",
      summary: "Data analyst building verified SQL reporting workflows.", skills: "SQL, BigQuery, Power BI",
      experience: [{ role: "Data Analyst", company: "Example", location: "India", dates: "2025 - Present", bullets: ["Built verified SQL reporting workflows."] }],
      projects: [], education: [], certifications: []
    }, { title: "Revenue Data Analyst", company: "Example", description: "Requires SQL, BigQuery and revenue reporting experience.", score: 80 });
    return json({ ok: true, model: pack.model, summary: pack.resume.summary, coverage: pack.coverage, latexTemplate: pack.latex.startsWith("\\documentclass{resume}") });
  }
  if (method === "GET" && path === "/api/bootstrap") return json(await bootstrap(env));

  if (method === "POST" && path === "/api/evaluations/run") {
    const settings = await env.DB.prepare("SELECT * FROM settings WHERE id=1").first();
    const result = runMatchingEvaluation({
      ...settings,
      target_role: "Data Analyst",
      alternate_titles: "BI Analyst,Junior Data Engineer",
      preferred_locations: "Hyderabad,Remote India",
      required_skills: "SQL,BigQuery,Power BI,Python,ETL,GCP",
      excluded_keywords: "commission",
      minimum_match_score: 50,
      candidate_years: 2,
      experience_tolerance_years: 1
    });
    await env.DB.prepare(`INSERT INTO accuracy_evaluations (id, suite_name, total, passed, accuracy, precision_score, recall_score, false_positives, false_negatives, details_json)
      VALUES (?, 'matching-baseline', ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(crypto.randomUUID(), result.total, result.passed, result.accuracy, result.precision, result.recall, result.falsePositives, result.falseNegatives, JSON.stringify(result.details)).run();
    return json({ ok: true, ...result });
  }
  if (method === "PUT" && path === "/api/notifications/read-all") {
    await env.DB.prepare("UPDATE app_notifications SET read_at=CURRENT_TIMESTAMP WHERE read_at IS NULL").run();
    return json({ ok: true });
  }
  const notification = pathMatch(path, "/api/notifications/:id/read");
  if (method === "PUT" && notification) {
    await env.DB.prepare("UPDATE app_notifications SET read_at=CURRENT_TIMESTAMP WHERE id=?").bind(notification.id).run();
    return json({ ok: true });
  }
  const documentHistory = pathMatch(path, "/api/applications/:id/documents");
  if (method === "GET" && documentHistory) {
    const { results } = await env.DB.prepare("SELECT * FROM document_versions WHERE application_id=? ORDER BY created_at DESC, kind, version_number DESC").bind(documentHistory.id).all();
    return json({ documents: results });
  }

  if (method === "POST" && path === "/api/scan") return json(await scanSources(env));
  if (method === "POST" && path === "/api/scan/queue") {
    const bucket = Math.floor(Date.now() / 300000);
    return json(await enqueueTask(env, "job_scan", {}, `job_scan:${bucket}`), 202);
  }
  if (method === "POST" && path === "/api/gmail/sync") {
    const result = await syncRecruiterReplies(env);
    const confirmations = await syncApplicationConfirmations(env);
    if (result.replies) await notify(env, `ApplyPilot found ${result.replies} new recruiter ${result.replies === 1 ? "reply" : "replies"}.`);
    return json({ ...result, confirmations });
  }
  if (method === "POST" && path === "/api/job-alerts/sync") return json(await syncJobAlertEmails(env));
  const leadParams = pathMatch(path, "/api/leads/:id");
  if (method === "POST" && leadParams) {
    const lead = await env.DB.prepare("SELECT * FROM job_leads WHERE id = ?").bind(leadParams.id).first();
    if (!lead) return json({ error: "Portal alert not found" }, 404);
    const body = await request.json();
    if (!body.company?.trim() || !body.description?.trim()) return json({ error: "Company and job description are required for accurate scoring" }, 400);
    const settings = await env.DB.prepare("SELECT * FROM settings WHERE id = 1").first();
    const profile = await env.DB.prepare("SELECT current_role_start, experience_at_search FROM candidate_profile WHERE id = 1").first();
    if (profile?.current_role_start) settings.candidate_years = Math.max(0, (Date.now() - new Date(`${profile.current_role_start}-01T00:00:00Z`).getTime()) / 31557600000);
    else settings.candidate_years = profile?.experience_at_search || null;
    const candidate = {
      title: body.title?.trim() || lead.subject,
      company: body.company.trim(),
      location: body.location?.trim() || "",
      workplaceType: body.workplaceType?.trim() || "",
      description: body.description.trim(),
      applyUrl: lead.url,
      salaryText: body.salaryText?.trim() || ""
    };
    const internship = /\bintern(?:ship)?\b/i.test(candidate.title);
    const scoreSettings = internship ? { ...settings, alternate_titles: `${settings.alternate_titles || ""},${settings.internship_titles || ""}`, minimum_salary: null } : settings;
    const match = scoreJob(candidate, scoreSettings);
    const eligible = match.eligible || (internship && match.score >= 40);
    const id = `alert:${await hashText(lead.url)}`;
    await env.DB.prepare(`INSERT INTO jobs (id, external_id, provider, company, title, location, workplace_type, description, apply_url, salary_text, score, score_reasons, status, opportunity_type)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET company=excluded.company, title=excluded.title, location=excluded.location, workplace_type=excluded.workplace_type, description=excluded.description, salary_text=excluded.salary_text, score=excluded.score, score_reasons=excluded.score_reasons, status=excluded.status, opportunity_type=excluded.opportunity_type`)
      .bind(id, lead.id, lead.provider, candidate.company, candidate.title, candidate.location, candidate.workplaceType, candidate.description.slice(0, 30000), candidate.applyUrl, candidate.salaryText, match.score, JSON.stringify(match.reasons), eligible ? "new" : "skipped", internship ? "internship" : "full_time").run();
    await env.DB.prepare("UPDATE job_leads SET status = 'imported' WHERE id = ?").bind(lead.id).run();
    await activity(env, "portal_job_scored", `${candidate.title} at ${candidate.company} scored ${match.score}%`, "job", id, { eligible });
    return json({ ok: true, id, ...match, eligible }, 201);
  }
  if (method === "PUT" && leadParams) {
    const body = await request.json();
    if (!['opened', 'imported', 'skipped'].includes(body.status)) return json({ error: "Invalid lead status" }, 400);
    await env.DB.prepare("UPDATE job_leads SET status = ? WHERE id = ?").bind(body.status, leadParams.id).run();
    return json({ ok: true });
  }

  if (method === "POST" && path === "/api/jobs/manual") {
    const body = await request.json();
    if (!body.title || !body.company || !body.applyUrl) return json({ error: "title, company and applyUrl are required" }, 400);
    let parsedUrl;
    try { parsedUrl = new URL(body.applyUrl); } catch { return json({ error: "A valid application URL is required" }, 400); }
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) return json({ error: "Only HTTP application URLs are allowed" }, 400);
    const settings = await env.DB.prepare("SELECT * FROM settings WHERE id = 1").first();
    const candidate = { title: body.title.trim(), company: body.company.trim(), location: body.location || "", workplaceType: body.workplaceType || "", description: body.description || "", applyUrl: parsedUrl.toString() };
    const internship = body.opportunityType === "internship" || /\bintern(?:ship)?\b/i.test(candidate.title);
    const scoreSettings = internship ? { ...settings, alternate_titles: `${settings.alternate_titles || ""},${settings.internship_titles || ""}`, minimum_salary: null } : settings;
    const match = scoreJob(candidate, scoreSettings);
    const id = `manual:${crypto.randomUUID()}`;
    await env.DB.prepare(`INSERT INTO jobs (id, external_id, provider, company, title, location, workplace_type, description, apply_url, salary_text, score, score_reasons, opportunity_type)
      VALUES (?, ?, 'manual', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, id, candidate.company, candidate.title, candidate.location, candidate.workplaceType, candidate.description.slice(0, 30000), candidate.applyUrl, body.salaryText || "", match.score, JSON.stringify(match.reasons), internship ? "internship" : "full_time").run();
    await activity(env, "job_added", `Manually added ${candidate.title} at ${candidate.company}`, "job", id);
    return json({ ok: true, id, score: match.score }, 201);
  }

  if (method === "GET" && path === "/api/sources") {
    const data = await bootstrap(env);
    return json(data.sources);
  }
  if (method === "POST" && path === "/api/sources") {
    const body = await request.json();
    if (!['greenhouse', 'lever', 'ashby', 'smartrecruiters', 'workable', 'recruitee', 'careerpage'].includes(body.provider) || !body.organization || !body.label) return json({ error: "provider, organization and label are required" }, 400);
    if (body.provider === "careerpage") {
      try { const parsed = new URL(body.organization); if (parsed.protocol !== "https:") throw new Error(); } catch { return json({ error: "Career page must be a valid HTTPS URL" }, 400); }
    }
    const table = ['workable', 'recruitee', 'careerpage'].includes(body.provider) ? "ats_sources" : ['ashby', 'smartrecruiters'].includes(body.provider) ? "external_sources" : "sources";
    await env.DB.prepare(`INSERT INTO ${table} (provider, organization, label) VALUES (?, ?, ?) ON CONFLICT(provider, organization) DO UPDATE SET label = excluded.label, enabled = 1`)
      .bind(body.provider, body.organization.trim(), body.label.trim()).run();
    await activity(env, "source_added", `Added ${body.label} job source`, "source", body.organization);
    return json({ ok: true }, 201);
  }
  const sourceParams = pathMatch(path, "/api/sources/:id");
  if (method === "DELETE" && sourceParams) {
    const [kind, rawId] = sourceParams.id.split(":");
    const table = kind === "ats" ? "ats_sources" : kind === "external" ? "external_sources" : "sources";
    await env.DB.prepare(`DELETE FROM ${table} WHERE id = ?`).bind(Number(rawId || sourceParams.id)).run();
    return json({ ok: true });
  }

  if (method === "GET" && path === "/api/data/export") return json(await bootstrap(env));

  if (method === "DELETE" && path === "/api/data") {
    const body = await request.json().catch(() => ({}));
    if (body.confirm !== "DELETE MY APPLYPILOT DATA") return json({ error: "Confirmation phrase is required" }, 400);
    await env.DB.batch([
      env.DB.prepare("DELETE FROM outreach"), env.DB.prepare("DELETE FROM applications"), env.DB.prepare("DELETE FROM recruiter_contacts"),
      env.DB.prepare("DELETE FROM jobs"), env.DB.prepare("DELETE FROM job_leads"), env.DB.prepare("DELETE FROM activity_log")
    ]);
    return json({ ok: true });
  }

  if (method === "POST" && path === "/api/resume-variants") {
    const body = await request.json();
    if (!body.name || !body.targetTitles || !body.filename) return json({ error: "name, targetTitles and filename are required" }, 400);
    await env.DB.prepare("INSERT INTO resume_variants (name, target_titles, filename) VALUES (?, ?, ?) ON CONFLICT(name) DO UPDATE SET target_titles=excluded.target_titles, filename=excluded.filename, updated_at=CURRENT_TIMESTAMP")
      .bind(body.name.trim(), body.targetTitles.trim(), body.filename.trim()).run();
    return json({ ok: true }, 201);
  }

  if (method === "PUT" && path === "/api/application-answers") {
    const body = await request.json();
    const answers = Array.isArray(body.answers) ? body.answers : [];
    await env.DB.batch(answers.filter(answer => answer.key && answer.label).map(answer => env.DB.prepare(`INSERT INTO application_answers (key, label, value, verified)
      VALUES (?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET label=excluded.label, value=excluded.value, verified=excluded.verified, updated_at=CURRENT_TIMESTAMP`)
      .bind(answer.key, answer.label, answer.value || "", answer.verified ? 1 : 0)));
    return json({ ok: true });
  }

  if (method === "POST" && path === "/api/evidence") {
    const body = await request.json();
    const types = ["experience", "project", "certification", "skill", "achievement"];
    if (!types.includes(body.evidenceType)) return json({ error: "Choose a valid evidence type" }, 400);
    if (!String(body.title || "").trim()) return json({ error: "Evidence title is required" }, 400);
    if (!body.confirmed) return json({ error: "Confirm that this evidence is accurate before saving" }, 400);
    const details = body.details && typeof body.details === "object" ? body.details : {};
    const id = crypto.randomUUID();
    await env.DB.prepare(`INSERT INTO verified_evidence (id, evidence_type, title, details_json, source_url, verified, active)
      VALUES (?, ?, ?, ?, ?, 1, 1)`).bind(id, body.evidenceType, body.title.trim(), JSON.stringify(details), String(body.sourceUrl || "user-confirmed").trim()).run();
    await activity(env, "evidence_verified", `Verified ${body.evidenceType} evidence added: ${body.title.trim()}`, "evidence", id);
    return json({ ok: true, id }, 201);
  }
  const evidenceItem = pathMatch(path, "/api/evidence/:id");
  if (method === "PUT" && evidenceItem) {
    const body = await request.json();
    const result = await env.DB.prepare("UPDATE verified_evidence SET active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(body.active ? 1 : 0, evidenceItem.id).run();
    if (!(result.meta.changes || 0)) return json({ error: "Evidence item not found" }, 404);
    return json({ ok: true });
  }
  if (method === "DELETE" && evidenceItem) {
    const result = await env.DB.prepare("DELETE FROM verified_evidence WHERE id = ?").bind(evidenceItem.id).run();
    if (!(result.meta.changes || 0)) return json({ error: "Evidence item not found" }, 404);
    return json({ ok: true });
  }

  const feedbackParams = pathMatch(path, "/api/jobs/:id/feedback");
  if (method === "PUT" && feedbackParams) {
    const body = await request.json();
    const relevance = Number(body.relevance);
    if (![-1, 1].includes(relevance)) return json({ error: "Relevance must be 1 or -1" }, 400);
    const job = await env.DB.prepare("SELECT id FROM jobs WHERE id=?").bind(feedbackParams.id).first();
    if (!job) return json({ error: "Job not found" }, 404);
    await env.DB.prepare(`INSERT INTO job_feedback (id, job_id, relevance, reason) VALUES (?, ?, ?, ?)
      ON CONFLICT(job_id) DO UPDATE SET relevance=excluded.relevance, reason=excluded.reason, updated_at=CURRENT_TIMESTAMP`)
      .bind(crypto.randomUUID(), job.id, relevance, String(body.reason || "").slice(0, 200)).run();
    const weights = await rebuildPreferenceWeights(env.DB);
    await activity(env, "match_feedback", relevance > 0 ? "Job marked relevant" : "Job marked not relevant", "job", job.id);
    return json({ ok: true, learnedFeatures: Object.keys(weights).length });
  }

  const decision = pathMatch(path, "/api/jobs/:id/decision");
  if (method === "POST" && decision) {
    const body = await request.json();
    if (!['shortlisted', 'skipped', 'approved'].includes(body.decision)) return json({ error: "Invalid decision" }, 400);
    const job = await env.DB.prepare("SELECT * FROM jobs WHERE id = ?").bind(decision.id).first();
    if (!job) return json({ error: "Job not found" }, 404);
    if (body.decision !== "approved") await env.DB.prepare("UPDATE jobs SET status = ? WHERE id = ?").bind(body.decision, job.id).run();
    let application = null;
    if (body.decision === "approved") {
      const settings = await env.DB.prepare("SELECT * FROM settings WHERE id = 1").first();
      const gate = evaluateApplicationGate(job, settings);
      if (!gate.allowed) return json({ error: gate.error }, 409);
      const master = await env.DB.prepare("SELECT * FROM master_resume_profiles WHERE id = 1").first();
      if (!master) return json({ error: "Verified master resume profile is missing" }, 409);
      const { results: evidence } = await env.DB.prepare("SELECT * FROM verified_evidence WHERE verified = 1 AND active = 1 ORDER BY created_at").all();
      await saveProjectSelections(env, job, evidence);
      const profile = mergeVerifiedEvidence(JSON.parse(master.profile_json), evidence);
      const jdHash = await contentHash(job.description || "");
      let tailored = await env.DB.prepare("SELECT * FROM tailored_resumes WHERE job_id = ? AND jd_hash = ?").bind(job.id, jdHash).first();
      if (!tailored) {
        const pack = await createBudgetedPack(env, profile, job);
        const tailoredId = crypto.randomUUID();
        await env.DB.prepare(`INSERT OR IGNORE INTO tailored_resumes (id, job_id, profile_snapshot, jd_hash, resume_json, audit_json, keyword_coverage, match_score, latex_content, status, model)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .bind(tailoredId, job.id, JSON.stringify(profile), jdHash, JSON.stringify(pack.resume), JSON.stringify(pack.audit), JSON.stringify(pack.coverage), pack.resume.matchScore, pack.latex, pack.status, pack.model).run();
        tailored = await env.DB.prepare("SELECT * FROM tailored_resumes WHERE job_id = ? AND jd_hash = ?").bind(job.id, jdHash).first();
      }
      const draft = await prepareApplication(env, job, settings);
      const { results: variants } = await env.DB.prepare("SELECT * FROM resume_variants ORDER BY is_default DESC, id").all();
      const title = job.title.toLowerCase();
      const resume = variants.find(variant => variant.target_titles.split(",").some(target => title.includes(target.trim().toLowerCase()))) || variants[0];
      const applicationId = crypto.randomUUID();
      await env.DB.prepare(`INSERT INTO applications (id, job_id, stage, resume_variant, cover_letter, screening_answers, tailored_resume_id)
        VALUES (?, ?, 'prepared', ?, ?, ?, ?) ON CONFLICT(job_id) DO UPDATE SET stage = 'prepared', resume_variant=excluded.resume_variant, cover_letter = excluded.cover_letter, screening_answers = excluded.screening_answers, tailored_resume_id=excluded.tailored_resume_id, updated_at = CURRENT_TIMESTAMP`)
        .bind(applicationId, job.id, resume?.name || null, draft.coverLetter || "", JSON.stringify({ summary: draft.screeningSummary || "" }), tailored.id).run();
      application = await env.DB.prepare("SELECT * FROM applications WHERE job_id = ?").bind(job.id).first();
      await env.DB.batch([
        env.DB.prepare(`INSERT INTO application_documents (id, application_id, tailored_resume_id, kind, content, mime_type) VALUES (?, ?, ?, 'latex', ?, 'application/x-latex') ON CONFLICT(application_id, kind) DO UPDATE SET tailored_resume_id=excluded.tailored_resume_id, content=excluded.content, created_at=CURRENT_TIMESTAMP`).bind(crypto.randomUUID(), application.id, tailored.id, tailored.latex_content || ""),
        env.DB.prepare(`INSERT INTO application_documents (id, application_id, tailored_resume_id, kind, content, mime_type) VALUES (?, ?, ?, 'json', ?, 'application/json') ON CONFLICT(application_id, kind) DO UPDATE SET tailored_resume_id=excluded.tailored_resume_id, content=excluded.content, created_at=CURRENT_TIMESTAMP`).bind(crypto.randomUUID(), application.id, tailored.id, tailored.resume_json),
        env.DB.prepare(`INSERT INTO application_documents (id, application_id, tailored_resume_id, kind, content, mime_type) VALUES (?, ?, ?, 'cover_letter', ?, 'text/plain') ON CONFLICT(application_id, kind) DO UPDATE SET tailored_resume_id=excluded.tailored_resume_id, content=excluded.content, created_at=CURRENT_TIMESTAMP`).bind(crypto.randomUUID(), application.id, tailored.id, draft.coverLetter || "")
      ]);
      await Promise.all([
        saveDocumentVersion(env, application.id, tailored.id, "latex", tailored.latex_content || "", "application/x-latex"),
        saveDocumentVersion(env, application.id, tailored.id, "json", tailored.resume_json, "application/json"),
        saveDocumentVersion(env, application.id, tailored.id, "cover_letter", draft.coverLetter || "", "text/plain")
      ]);
      await ensureChecklist(env, application.id, job.provider);
      const existingVersion = await env.DB.prepare("SELECT id FROM resume_versions WHERE application_id = ? LIMIT 1").bind(application.id).first();
      if (!existingVersion) await saveResumeVersion(env, application.id, tailored.id, {
        resume: JSON.parse(tailored.resume_json), audit: JSON.parse(tailored.audit_json || "{}"), coverage: JSON.parse(tailored.keyword_coverage || "{}"), latex: tailored.latex_content || "", model: tailored.model || ""
      }, "Initial tailored resume");
      const contactEmails = [...new Set((job.description || "").match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [])].slice(0, 5);
      if (contactEmails.length) await env.DB.batch(contactEmails.map(email => env.DB.prepare(`INSERT INTO recruiter_contacts (job_id, email, source_url, verified)
        VALUES (?, ?, ?, 0) ON CONFLICT(job_id, email) DO NOTHING`).bind(job.id, email.toLowerCase(), job.apply_url)));
      await env.DB.prepare("UPDATE jobs SET status = 'approved' WHERE id = ?").bind(job.id).run();
    }
    await activity(env, "job_decision", `${body.decision}: ${job.title} at ${job.company}`, "job", job.id);
    return json({ ok: true, application });
  }

  const stage = pathMatch(path, "/api/applications/:id/stage");
  if (method === "PUT" && stage) {
    const body = await request.json();
    const valid = ['approved','prepared','applied','outreach','interview','offer','rejected','withdrawn'];
    if (!valid.includes(body.stage)) return json({ error: "Invalid stage" }, 400);
    await env.DB.prepare(`UPDATE applications SET stage = ?, submitted_at = CASE WHEN ? = 'applied' THEN CURRENT_TIMESTAMP ELSE submitted_at END,
      submission_status = CASE WHEN ? = 'applied' THEN 'submitted_unconfirmed' ELSE submission_status END, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .bind(body.stage, body.stage, body.stage, stage.id).run();
    await activity(env, "stage_changed", `Application moved to ${body.stage}`, "application", stage.id);
    if (body.stage === "applied") {
      await env.DB.batch([
        env.DB.prepare("UPDATE application_checklist SET completed = 1, completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE application_id = ? AND item_key = 'submitted'").bind(stage.id),
        env.DB.prepare(`INSERT INTO application_events (id, application_id, event_type, source, confidence, evidence)
          VALUES (?, ?, 'submission_reported', 'user', 0.55, 'User marked the application as submitted')`).bind(crypto.randomUUID(), stage.id)
      ]);
    }
    return json({ ok: true });
  }

  const opened = pathMatch(path, "/api/applications/:id/opened");
  if (method === "POST" && opened) {
    await env.DB.batch([
      env.DB.prepare("UPDATE applications SET submission_status='form_opened', updated_at=CURRENT_TIMESTAMP WHERE id=? AND submission_status='not_started'").bind(opened.id),
      env.DB.prepare(`INSERT INTO application_events (id, application_id, event_type, source, confidence, evidence)
        VALUES (?, ?, 'application_opened', 'browser', 0.35, 'Official application link opened')`).bind(crypto.randomUUID(), opened.id)
    ]);
    return json({ ok: true });
  }

  const verifySubmission = pathMatch(path, "/api/applications/:id/verify-submission");
  if (method === "POST" && verifySubmission) {
    const body = await request.json().catch(() => ({}));
    const evidence = String(body.evidence || "Manual confirmation").slice(0, 500);
    await env.DB.batch([
      env.DB.prepare(`UPDATE applications SET stage='applied', submission_status='confirmed', confirmation_source='manual',
        confirmation_confidence=0.8, last_verified_at=CURRENT_TIMESTAMP, submitted_at=COALESCE(submitted_at,CURRENT_TIMESTAMP), updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(verifySubmission.id),
      env.DB.prepare(`INSERT INTO application_events (id, application_id, event_type, source, confidence, evidence)
        VALUES (?, ?, 'submission_confirmed', 'manual', 0.8, ?)`).bind(crypto.randomUUID(), verifySubmission.id, evidence)
    ]);
    return json({ ok: true });
  }

  const checklistItem = pathMatch(path, "/api/applications/:id/checklist/:key");
  if (method === "PUT" && checklistItem) {
    const body = await request.json();
    const result = await env.DB.prepare(`UPDATE application_checklist SET completed = ?, completed_at = CASE WHEN ? = 1 THEN CURRENT_TIMESTAMP ELSE NULL END, updated_at = CURRENT_TIMESTAMP
      WHERE application_id = ? AND item_key = ?`).bind(body.completed ? 1 : 0, body.completed ? 1 : 0, checklistItem.id, checklistItem.key).run();
    if (!(result.meta.changes || 0)) return json({ error: "Checklist item not found" }, 404);
    return json({ ok: true });
  }

  const restoreVersion = pathMatch(path, "/api/applications/:id/resume-versions/:version/restore");
  if (method === "POST" && restoreVersion) {
    const application = await env.DB.prepare("SELECT * FROM applications WHERE id = ?").bind(restoreVersion.id).first();
    if (!application?.tailored_resume_id) return json({ error: "Application resume not found" }, 404);
    const selected = await env.DB.prepare("SELECT * FROM resume_versions WHERE application_id = ? AND version_number = ?").bind(application.id, Number(restoreVersion.version)).first();
    if (!selected) return json({ error: "Resume version not found" }, 404);
    const current = await env.DB.prepare("SELECT * FROM tailored_resumes WHERE id = ?").bind(application.tailored_resume_id).first();
    const pack = { resume: JSON.parse(selected.resume_json), audit: JSON.parse(selected.audit_json || "{}"), coverage: JSON.parse(selected.keyword_coverage || "{}"), latex: selected.latex_content || "", model: selected.model || "restored-version" };
    await env.DB.prepare(`UPDATE tailored_resumes SET resume_json=?, audit_json=?, keyword_coverage=?, match_score=?, latex_content=?, status='review', model=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`)
      .bind(selected.resume_json, selected.audit_json, selected.keyword_coverage, pack.resume.matchScore || null, selected.latex_content || "", pack.model, current.id).run();
    await env.DB.batch([
      env.DB.prepare("UPDATE applications SET stage='prepared', updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(application.id),
      env.DB.prepare("UPDATE application_documents SET content=?, created_at=CURRENT_TIMESTAMP WHERE application_id=? AND kind='json'").bind(selected.resume_json, application.id),
      env.DB.prepare("UPDATE application_documents SET content=?, created_at=CURRENT_TIMESTAMP WHERE application_id=? AND kind='latex'").bind(selected.latex_content || "", application.id)
    ]);
    await Promise.all([
      saveDocumentVersion(env, application.id, current.id, "json", selected.resume_json, "application/json"),
      saveDocumentVersion(env, application.id, current.id, "latex", selected.latex_content || "", "application/x-latex")
    ]);
    const saved = await saveResumeVersion(env, application.id, current.id, pack, `Restored version ${selected.version_number}`, current ? JSON.parse(current.resume_json) : {});
    await activity(env, "resume_version_restored", `Resume version ${selected.version_number} restored as v${saved.version}`, "application", application.id);
    return json({ ok: true, ...saved });
  }

  const regenerate = pathMatch(path, "/api/applications/:id/regenerate-resume");
  if (method === "POST" && regenerate) {
    const body = await request.json().catch(() => ({}));
    const instruction = validateRevisionInstruction(body.instruction);
    const application = await env.DB.prepare(`SELECT a.*, j.title, j.company, j.description, j.score
      FROM applications a JOIN jobs j ON j.id = a.job_id WHERE a.id = ?`).bind(regenerate.id).first();
    if (!application) return json({ error: "Application not found" }, 404);
    const master = await env.DB.prepare("SELECT * FROM master_resume_profiles WHERE id = 1").first();
    if (!master) return json({ error: "Verified master resume profile is missing" }, 409);
    const { results: evidence } = await env.DB.prepare("SELECT * FROM verified_evidence WHERE verified = 1 AND active = 1 ORDER BY created_at").all();
    const profile = mergeVerifiedEvidence(JSON.parse(master.profile_json), evidence);
    const job = { title: application.title, company: application.company, description: application.description || "", score: application.score };
    const current = application.tailored_resume_id ? await env.DB.prepare("SELECT * FROM tailored_resumes WHERE id = ?").bind(application.tailored_resume_id).first() : null;
    const before = current ? JSON.parse(current.resume_json) : {};
    const existingVersion = await env.DB.prepare("SELECT id FROM resume_versions WHERE application_id = ? LIMIT 1").bind(application.id).first();
    if (current && !existingVersion) await saveResumeVersion(env, application.id, current.id, {
      resume: before, audit: JSON.parse(current.audit_json || "{}"), coverage: JSON.parse(current.keyword_coverage || "{}"), latex: current.latex_content || "", model: current.model || ""
    }, "Initial tailored resume");
    await saveProjectSelections(env, job, evidence);
    const pack = await createBudgetedPack(env, profile, job, { instruction });
    const jdHash = await contentHash(job.description);
    const tailoredId = current?.id || crypto.randomUUID();
    if (current) {
      await env.DB.prepare(`UPDATE tailored_resumes SET profile_snapshot=?, jd_hash=?, resume_json=?, audit_json=?, keyword_coverage=?, match_score=?, latex_content=?, status=?, model=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`)
        .bind(JSON.stringify(profile), jdHash, JSON.stringify(pack.resume), JSON.stringify(pack.audit), JSON.stringify(pack.coverage), pack.resume.matchScore, pack.latex, pack.status, pack.model, tailoredId).run();
    } else {
      await env.DB.prepare(`INSERT INTO tailored_resumes (id, job_id, profile_snapshot, jd_hash, resume_json, audit_json, keyword_coverage, match_score, latex_content, status, model)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(tailoredId, application.job_id, JSON.stringify(profile), jdHash, JSON.stringify(pack.resume), JSON.stringify(pack.audit), JSON.stringify(pack.coverage), pack.resume.matchScore, pack.latex, pack.status, pack.model).run();
    }
    await env.DB.prepare("UPDATE applications SET tailored_resume_id=?, stage='prepared', updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(tailoredId, application.id).run();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO application_documents (id, application_id, tailored_resume_id, kind, content, mime_type) VALUES (?, ?, ?, 'latex', ?, 'application/x-latex') ON CONFLICT(application_id, kind) DO UPDATE SET tailored_resume_id=excluded.tailored_resume_id, content=excluded.content, created_at=CURRENT_TIMESTAMP`).bind(crypto.randomUUID(), application.id, tailoredId, pack.latex),
      env.DB.prepare(`INSERT INTO application_documents (id, application_id, tailored_resume_id, kind, content, mime_type) VALUES (?, ?, ?, 'json', ?, 'application/json') ON CONFLICT(application_id, kind) DO UPDATE SET tailored_resume_id=excluded.tailored_resume_id, content=excluded.content, created_at=CURRENT_TIMESTAMP`).bind(crypto.randomUUID(), application.id, tailoredId, JSON.stringify(pack.resume))
    ]);
    await Promise.all([
      saveDocumentVersion(env, application.id, tailoredId, "latex", pack.latex, "application/x-latex"),
      saveDocumentVersion(env, application.id, tailoredId, "json", JSON.stringify(pack.resume), "application/json")
    ]);
    const version = await saveResumeVersion(env, application.id, tailoredId, pack, instruction || "Regenerate for this JD", before);
    await activity(env, "resume_regenerated", `Resume v${version.version} regenerated with ${pack.model}: ${application.title} at ${application.company}`, "application", application.id, { model: pack.model, coverage: pack.coverage.pct, instruction, diff: version.diff });
    return json({ ok: true, model: pack.model, matchScore: pack.resume.matchScore, coverage: pack.coverage, ...version });
  }

  const interviewPrep = pathMatch(path, "/api/applications/:id/interview-prep");
  if (method === "POST" && interviewPrep) {
    const application = await env.DB.prepare("SELECT a.id, j.title, j.company, j.description FROM applications a JOIN jobs j ON j.id = a.job_id WHERE a.id = ?").bind(interviewPrep.id).first();
    if (!application) return json({ error: "Application not found" }, 404);
    const profile = await env.DB.prepare("SELECT current_title FROM candidate_profile WHERE id = 1").first();
    const prep = createInterviewPrep(application, { title: profile?.current_title });
    await env.DB.prepare(`INSERT INTO interview_workspaces (application_id, prep_json) VALUES (?, ?)
      ON CONFLICT(application_id) DO UPDATE SET prep_json=excluded.prep_json, updated_at=CURRENT_TIMESTAMP`).bind(application.id, JSON.stringify(prep)).run();
    await activity(env, "interview_prep_created", `Interview prep created for ${application.title} at ${application.company}`, "application", application.id);
    return json({ ok: true, prep });
  }

  const tailoredApproval = pathMatch(path, "/api/tailored-resumes/:id/approve");
  if (method === "POST" && tailoredApproval) {
    const result = await env.DB.prepare("UPDATE tailored_resumes SET status = 'approved', updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(tailoredApproval.id).run();
    if (!(result.meta.changes || 0)) return json({ error: "Tailored resume not found" }, 404);
    await env.DB.prepare("UPDATE applications SET stage = 'approved', updated_at = CURRENT_TIMESTAMP WHERE tailored_resume_id = ? AND stage = 'prepared'").bind(tailoredApproval.id).run();
    await env.DB.prepare("UPDATE application_checklist SET completed = 1, completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE application_id IN (SELECT id FROM applications WHERE tailored_resume_id = ?) AND item_key = 'resume_approved'").bind(tailoredApproval.id).run();
    await activity(env, "tailored_resume_approved", "Job-specific resume approved", "tailored_resume", tailoredApproval.id);
    return json({ ok: true });
  }

  if (method === "POST" && path === "/api/outreach") {
    const body = await request.json();
    if (!body.applicationId || !body.recruiterEmail || !body.subject || !body.body) return json({ error: "applicationId, recruiterEmail, subject and body are required" }, 400);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.recruiterEmail.trim())) return json({ error: "A valid recruiter email is required" }, 400);
    const id = crypto.randomUUID();
    await env.DB.prepare(`INSERT INTO outreach (id, application_id, recruiter_name, recruiter_email, subject, body, scheduled_for)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, body.applicationId, body.recruiterName || null, body.recruiterEmail || null, body.subject, body.body, body.scheduledFor || null).run();
    if (body.verifiedContact) {
      const application = await env.DB.prepare("SELECT job_id FROM applications WHERE id = ?").bind(body.applicationId).first();
      if (application) await env.DB.prepare(`INSERT INTO recruiter_contacts (job_id, name, email, source_url, verified)
        VALUES (?, ?, ?, ?, 1) ON CONFLICT(job_id, email) DO UPDATE SET name=excluded.name, source_url=excluded.source_url, verified=1`)
        .bind(application.job_id, body.recruiterName || null, body.recruiterEmail.trim().toLowerCase(), body.sourceUrl || "user-confirmed").run();
    }
    await activity(env, "outreach_drafted", "Recruiter outreach draft created", "outreach", id);
    await env.DB.prepare("UPDATE application_checklist SET completed = 1, completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE application_id = ? AND item_key = 'followup'").bind(body.applicationId).run();
    return json({ ok: true, id }, 201);
  }
  const approveSend = pathMatch(path, "/api/outreach/:id/approve-send");
  if (method === "POST" && approveSend) {
    const item = await env.DB.prepare("SELECT * FROM outreach WHERE id = ?").bind(approveSend.id).first();
    if (!item) return json({ error: "Follow-up not found" }, 404);
    if (!['draft', 'approved'].includes(item.status)) return json({ error: "Follow-up has already been handled" }, 409);
    if (!item.recruiter_email) return json({ error: "Recruiter email is required" }, 400);
    const sent = await sendOutreach(env, item);
    await env.DB.batch([
      env.DB.prepare("UPDATE outreach SET status = 'sent', thread_id = ?, sent_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(sent.threadId || null, item.id),
      env.DB.prepare("UPDATE applications SET stage = 'outreach', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND stage IN ('approved','prepared','applied')").bind(item.application_id),
      env.DB.prepare("INSERT INTO activity_log (event_type, entity_type, entity_id, message) VALUES ('followup_sent', 'outreach', ?, ?)").bind(item.id, `Approved follow-up sent to ${item.recruiter_email}`)
    ]);
    return json({ ok: true, messageId: sent.id });
  }
  const send = pathMatch(path, "/api/outreach/:id/send");
  if (method === "POST" && send) {
    const item = await env.DB.prepare("SELECT * FROM outreach WHERE id = ?").bind(send.id).first();
    if (!item) return json({ error: "Outreach not found" }, 404);
    if (item.status === "sent" || item.status === "replied") return json({ error: "Message already handled" }, 409);
    const sent = await sendOutreach(env, item);
    await env.DB.prepare("UPDATE outreach SET status = 'sent', thread_id = ?, sent_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(sent.threadId || null, item.id).run();
    await activity(env, "email_sent", `Recruiter email sent to ${item.recruiter_email}`, "outreach", item.id);
    return json({ ok: true, messageId: sent.id });
  }
  const cancelOutreach = pathMatch(path, "/api/outreach/:id/cancel");
  if (method === "POST" && cancelOutreach) {
    const result = await env.DB.prepare("UPDATE outreach SET status='cancelled', scheduled_for=NULL, updated_at=CURRENT_TIMESTAMP WHERE id=? AND status IN ('draft','approved')").bind(cancelOutreach.id).run();
    if (!(result.meta.changes || 0)) return json({ error: "Follow-up is not cancellable" }, 409);
    await activity(env, "followup_cancelled", "Scheduled recruiter follow-up cancelled", "outreach", cancelOutreach.id);
    return json({ ok: true });
  }

  if (method === "PUT" && path === "/api/settings") {
    const body = await request.json();
    const current = await env.DB.prepare("SELECT * FROM settings WHERE id = 1").first();
    const next = { ...current, ...body };
    await env.DB.prepare(`UPDATE settings SET target_role=?, alternate_titles=?, preferred_locations=?, required_skills=?, excluded_keywords=?, minimum_salary=?, daily_application_limit=?, require_approval=?, followups_enabled=?, followup_days=?, active_from=?, freshness_hours=?, minimum_match_score=?, browser_notifications=?, tailoring_minimum_score=?, must_have_skills=?, internship_titles=?, experience_tolerance_years=?, search_paused=?, ai_daily_budget=?, feedback_learning_enabled=?, updated_at=CURRENT_TIMESTAMP WHERE id=1`)
      .bind(next.target_role, next.alternate_titles, next.preferred_locations, next.required_skills, next.excluded_keywords, next.minimum_salary, Number(next.daily_application_limit), next.require_approval ? 1 : 0, next.followups_enabled ? 1 : 0, Number(next.followup_days), next.active_from || null, Number(next.freshness_hours || 168), Number(next.minimum_match_score || 65), next.browser_notifications ? 1 : 0, Number(next.tailoring_minimum_score || 75), next.must_have_skills || "", next.internship_titles || "", Number(next.experience_tolerance_years ?? 1), next.search_paused ? 1 : 0, Number(next.ai_daily_budget || 4), next.feedback_learning_enabled ? 1 : 0).run();
    await activity(env, "settings_updated", "Search preferences updated");
    return json({ ok: true });
  }

  if (method === "PUT" && path === "/api/profile") {
    const body = await request.json();
    const current = await env.DB.prepare("SELECT * FROM candidate_profile WHERE id = 1").first();
    const next = { ...current, ...body };
    await env.DB.prepare(`UPDATE candidate_profile SET full_name=?, email=?, phone=?, home_location=?, linkedin_url=?, portfolio_url=?, current_title=?, years_experience=?, education=?, verified_skills=?, evidence=?, target_recommendations=?, work_authorization=?, sponsorship_required=?, notice_period=?, minimum_salary=?, experience_at_search=?, work_modes=?, employment_types=?, willing_to_relocate=?, target_salary=?, stretch_salary=?, current_role_start=?, internship_start=?, internship_end=?, github_url=?, preferred_industries=?, demographic_response=?, resume_filename=?, resume_local_path=?, updated_at=CURRENT_TIMESTAMP WHERE id=1`)
      .bind(next.full_name, next.email, next.phone, next.home_location, next.linkedin_url, next.portfolio_url, next.current_title, next.years_experience, next.education, JSON.stringify(asArray(next.verified_skills)), JSON.stringify(asArray(next.evidence)), JSON.stringify(asArray(next.target_recommendations)), next.work_authorization, next.sponsorship_required, next.notice_period, next.minimum_salary, next.experience_at_search, JSON.stringify(asArray(next.work_modes)), JSON.stringify(asArray(next.employment_types)), next.willing_to_relocate ? 1 : 0, next.target_salary, next.stretch_salary, next.current_role_start, next.internship_start, next.internship_end, next.github_url, JSON.stringify(asArray(next.preferred_industries)), next.demographic_response, next.resume_filename, next.resume_local_path).run();
    await activity(env, "profile_updated", "Candidate profile updated from verified resume evidence");
    return json({ ok: true });
  }

  return json({ error: "Not found" }, 404);
}

async function hashText(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest).slice(0, 12)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

async function processScanTask(env) {
  const scan = await scanSources(env);
  const alerts = env.GMAIL_REFRESH_TOKEN ? await syncJobAlertEmails(env) : { discovered: 0 };
  if (scan.discovered) await notify(env, `ApplyPilot found ${scan.discovered} new matching ${scan.discovered === 1 ? "job" : "jobs"}.`);
  if (scan.discovered && env.GMAIL_REFRESH_TOKEN) {
    const profile = await env.DB.prepare("SELECT email FROM candidate_profile WHERE id = 1").first();
    const lines = scan.matches.map(match => `${match.score}% - ${match.title} at ${match.company}\n${match.location || "Location not listed"}\n${match.applyUrl}`).join("\n\n");
    await sendNotificationEmail(env, profile?.email, `ApplyPilot: ${scan.discovered} new high-fit ${scan.discovered === 1 ? "job" : "jobs"}`, `New roles passed your eligibility rules:\n\n${lines}\n\nReview now: https://applypilot.pages.dev`);
    await activity(env, "match_alert", `Immediate email alert sent for ${scan.discovered} new matches`);
  }
  if (env.GMAIL_REFRESH_TOKEN) {
    const replies = await syncRecruiterReplies(env);
    if (replies.replies) await notify(env, `ApplyPilot detected ${replies.replies} recruiter ${replies.replies === 1 ? "reply" : "replies"}. Follow-ups were stopped.`);
    await syncApplicationConfirmations(env);
  }
  return { ...scan, portalLeads: alerts.discovered };
}

async function scheduled(env, controller) {
  if (controller.cron === "*/5 * * * *") {
    if (env.TASK_QUEUE) {
      const bucket = Math.floor(Date.now() / 300000);
      return enqueueTask(env, "job_scan", {}, `scheduled_scan:${bucket}`);
    }
    return processScanTask(env);
  }
  const digestKey = `daily_digest:${new Date().toISOString().slice(0, 10)}`;
  const alreadySent = await env.DB.prepare("SELECT value FROM integration_state WHERE key = ?").bind(digestKey).first();
  if (!alreadySent && env.GMAIL_REFRESH_TOKEN) {
    const { results: matches } = await env.DB.prepare("SELECT title, company, location, score, apply_url FROM jobs WHERE status='new' AND score >= 75 AND discovered_at >= datetime('now', '-1 day') ORDER BY score DESC LIMIT 10").all();
    const profile = await env.DB.prepare("SELECT email FROM candidate_profile WHERE id = 1").first();
    if (matches.length && profile?.email) {
      const lines = matches.map(match => `${match.score}% - ${match.title} at ${match.company}\n${match.location || "Location not listed"}\n${match.apply_url}`).join("\n\n");
      await sendNotificationEmail(env, profile.email, `ApplyPilot daily digest: ${matches.length} strong matches`, `${lines}\n\nReview: https://applypilot.pages.dev`);
      await activity(env, "daily_digest", `Daily digest sent with ${matches.length} strong matches`);
    }
    await env.DB.prepare("INSERT INTO integration_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP").bind(digestKey, "sent").run();
  }
  const due = await env.DB.prepare(`SELECT COUNT(*) AS count FROM outreach WHERE status = 'approved' AND scheduled_for <= CURRENT_TIMESTAMP`).first();
  await activity(env, "followup_check", `${due.count} approved follow-ups are due`);
  return due;
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(env, request) });
    try {
      const response = await route(request, env);
      const headers = new Headers(response.headers);
      Object.entries(cors(env, request)).forEach(([key, value]) => headers.set(key, value));
      headers.set("X-Content-Type-Options", "nosniff");
      headers.set("Referrer-Policy", "no-referrer");
      headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
      headers.set("Cache-Control", "no-store");
      return new Response(response.body, { status: response.status, headers });
    } catch (error) {
      return json({ error: error.message || "Unexpected error" }, 500, cors(env, request));
    }
  },
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(scheduled(env, controller));
  },
  async queue(batch, env) {
    for (const message of batch.messages) {
      try {
        await runQueuedTask(env, message.body, { job_scan: () => processScanTask(env) });
        message.ack();
      } catch {
        message.retry({ delaySeconds: 60 });
      }
    }
  }
};
