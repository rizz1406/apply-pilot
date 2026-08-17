import { scanSources } from "./discovery.js";
import { prepareApplication } from "./ai.js";
import { sendNotificationEmail, sendOutreach, syncApplicationConfirmations, syncJobAlertEmails, syncRecruiterReplies } from "./gmail.js";
import { scoreJob } from "./matching.js";
import { notify } from "./notifications.js";
import { contentHash, createTailoredPack } from "./resume-tailor.js";

const json = (data, status = 200, extra = {}) => new Response(JSON.stringify(data), {
  status,
  headers: { "Content-Type": "application/json; charset=utf-8", ...extra }
});

const cors = env => ({
  "Access-Control-Allow-Origin": env.APP_ORIGIN || "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Vary": "Origin"
});

function authorized(request, env) {
  if (env.DEMO_MODE === "true" && !env.ADMIN_TOKEN) return true;
  return Boolean(env.ADMIN_TOKEN) && request.headers.get("Authorization") === `Bearer ${env.ADMIN_TOKEN}`;
}

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

async function bootstrap(env) {
  const [settings, profile, jobs, applications, outreach, activities, standardSources, externalSources, leads, resumeVariants, analytics] = await Promise.all([
    env.DB.prepare("SELECT * FROM settings WHERE id = 1").first(),
    env.DB.prepare("SELECT * FROM candidate_profile WHERE id = 1").first(),
    env.DB.prepare("SELECT * FROM jobs WHERE status IN ('new','shortlisted') ORDER BY score DESC, discovered_at DESC LIMIT 100").all(),
    env.DB.prepare(`SELECT a.*, j.title, j.company, j.score, j.apply_url, j.description,
      t.resume_json AS tailored_resume_json, t.audit_json AS resume_audit_json, t.keyword_coverage, t.match_score AS tailored_match_score, t.latex_content, t.status AS tailored_status
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
      (SELECT COUNT(*) FROM applications WHERE stage = 'rejected') AS rejected`).first()
  ]);
  const sources = [
    ...standardSources.results.map(source => ({ ...source, id: `core:${source.id}` })),
    ...externalSources.results.map(source => ({ ...source, id: `external:${source.id}` }))
  ].sort((a, b) => a.label.localeCompare(b.label));
  return { settings, profile, jobs: jobs.results, applications: applications.results, outreach: outreach.results, activity: activities.results, sources, leads: leads.results, resumeVariants: resumeVariants.results, analytics, demoMode: env.DEMO_MODE === "true" };
}

async function route(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  if (method === "GET" && path === "/api/health") return json({ ok: true, service: "applypilot", time: new Date().toISOString() });
  if (!authorized(request, env)) return json({ error: "Unauthorized" }, 401);
  if (method === "GET" && path === "/api/bootstrap") return json(await bootstrap(env));

  if (method === "POST" && path === "/api/scan") return json(await scanSources(env));
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
    const match = scoreJob(candidate, settings);
    const id = `alert:${await hashText(lead.url)}`;
    await env.DB.prepare(`INSERT INTO jobs (id, external_id, provider, company, title, location, workplace_type, description, apply_url, salary_text, score, score_reasons, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET company=excluded.company, title=excluded.title, location=excluded.location, workplace_type=excluded.workplace_type, description=excluded.description, salary_text=excluded.salary_text, score=excluded.score, score_reasons=excluded.score_reasons, status=excluded.status`)
      .bind(id, lead.id, lead.provider, candidate.company, candidate.title, candidate.location, candidate.workplaceType, candidate.description.slice(0, 30000), candidate.applyUrl, candidate.salaryText, match.score, JSON.stringify(match.reasons), match.eligible ? "new" : "skipped").run();
    await env.DB.prepare("UPDATE job_leads SET status = 'imported' WHERE id = ?").bind(lead.id).run();
    await activity(env, "portal_job_scored", `${candidate.title} at ${candidate.company} scored ${match.score}%`, "job", id, { eligible: match.eligible });
    return json({ ok: true, id, ...match }, 201);
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
    const match = scoreJob(candidate, settings);
    const id = `manual:${crypto.randomUUID()}`;
    await env.DB.prepare(`INSERT INTO jobs (id, external_id, provider, company, title, location, workplace_type, description, apply_url, salary_text, score, score_reasons)
      VALUES (?, ?, 'manual', ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, id, candidate.company, candidate.title, candidate.location, candidate.workplaceType, candidate.description.slice(0, 30000), candidate.applyUrl, body.salaryText || "", match.score, JSON.stringify(match.reasons)).run();
    await activity(env, "job_added", `Manually added ${candidate.title} at ${candidate.company}`, "job", id);
    return json({ ok: true, id, score: match.score }, 201);
  }

  if (method === "GET" && path === "/api/sources") {
    const data = await bootstrap(env);
    return json(data.sources);
  }
  if (method === "POST" && path === "/api/sources") {
    const body = await request.json();
    if (!['greenhouse', 'lever', 'ashby', 'smartrecruiters'].includes(body.provider) || !body.organization || !body.label) return json({ error: "provider, organization and label are required" }, 400);
    const table = ['ashby', 'smartrecruiters'].includes(body.provider) ? "external_sources" : "sources";
    await env.DB.prepare(`INSERT INTO ${table} (provider, organization, label) VALUES (?, ?, ?) ON CONFLICT(provider, organization) DO UPDATE SET label = excluded.label, enabled = 1`)
      .bind(body.provider, body.organization.trim(), body.label.trim()).run();
    await activity(env, "source_added", `Added ${body.label} job source`, "source", body.organization);
    return json({ ok: true }, 201);
  }
  const sourceParams = pathMatch(path, "/api/sources/:id");
  if (method === "DELETE" && sourceParams) {
    const [kind, rawId] = sourceParams.id.split(":");
    const table = kind === "external" ? "external_sources" : "sources";
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

  const decision = pathMatch(path, "/api/jobs/:id/decision");
  if (method === "POST" && decision) {
    const body = await request.json();
    if (!['shortlisted', 'skipped', 'approved'].includes(body.decision)) return json({ error: "Invalid decision" }, 400);
    const job = await env.DB.prepare("SELECT * FROM jobs WHERE id = ?").bind(decision.id).first();
    if (!job) return json({ error: "Job not found" }, 404);
    await env.DB.prepare("UPDATE jobs SET status = ? WHERE id = ?").bind(body.decision, job.id).run();
    let application = null;
    if (body.decision === "approved") {
      const settings = await env.DB.prepare("SELECT * FROM settings WHERE id = 1").first();
      const master = await env.DB.prepare("SELECT * FROM master_resume_profiles WHERE id = 1").first();
      if (!master) return json({ error: "Verified master resume profile is missing" }, 409);
      const profile = JSON.parse(master.profile_json);
      const jdHash = await contentHash(job.description || "");
      let tailored = await env.DB.prepare("SELECT * FROM tailored_resumes WHERE job_id = ? AND jd_hash = ?").bind(job.id, jdHash).first();
      if (!tailored) {
        const pack = await createTailoredPack(env, profile, job);
        const tailoredId = crypto.randomUUID();
        await env.DB.prepare(`INSERT INTO tailored_resumes (id, job_id, profile_snapshot, jd_hash, resume_json, audit_json, keyword_coverage, match_score, latex_content, status, model)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .bind(tailoredId, job.id, JSON.stringify(profile), jdHash, JSON.stringify(pack.resume), JSON.stringify(pack.audit), JSON.stringify(pack.coverage), pack.resume.matchScore, pack.latex, pack.status, pack.model).run();
        tailored = await env.DB.prepare("SELECT * FROM tailored_resumes WHERE id = ?").bind(tailoredId).first();
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
    }
    await activity(env, "job_decision", `${body.decision}: ${job.title} at ${job.company}`, "job", job.id);
    return json({ ok: true, application });
  }

  const stage = pathMatch(path, "/api/applications/:id/stage");
  if (method === "PUT" && stage) {
    const body = await request.json();
    const valid = ['approved','prepared','applied','outreach','interview','offer','rejected','withdrawn'];
    if (!valid.includes(body.stage)) return json({ error: "Invalid stage" }, 400);
    await env.DB.prepare("UPDATE applications SET stage = ?, submitted_at = CASE WHEN ? = 'applied' THEN CURRENT_TIMESTAMP ELSE submitted_at END, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(body.stage, body.stage, stage.id).run();
    await activity(env, "stage_changed", `Application moved to ${body.stage}`, "application", stage.id);
    return json({ ok: true });
  }

  const tailoredApproval = pathMatch(path, "/api/tailored-resumes/:id/approve");
  if (method === "POST" && tailoredApproval) {
    const result = await env.DB.prepare("UPDATE tailored_resumes SET status = 'approved', updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(tailoredApproval.id).run();
    if (!(result.meta.changes || 0)) return json({ error: "Tailored resume not found" }, 404);
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
    await activity(env, "outreach_drafted", "Recruiter outreach draft created", "outreach", id);
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

  if (method === "PUT" && path === "/api/settings") {
    const body = await request.json();
    const current = await env.DB.prepare("SELECT * FROM settings WHERE id = 1").first();
    const next = { ...current, ...body };
    await env.DB.prepare(`UPDATE settings SET target_role=?, alternate_titles=?, preferred_locations=?, required_skills=?, excluded_keywords=?, minimum_salary=?, daily_application_limit=?, require_approval=?, followups_enabled=?, followup_days=?, active_from=?, freshness_hours=?, minimum_match_score=?, browser_notifications=?, updated_at=CURRENT_TIMESTAMP WHERE id=1`)
      .bind(next.target_role, next.alternate_titles, next.preferred_locations, next.required_skills, next.excluded_keywords, next.minimum_salary, Number(next.daily_application_limit), next.require_approval ? 1 : 0, next.followups_enabled ? 1 : 0, Number(next.followup_days), next.active_from || null, Number(next.freshness_hours || 72), Number(next.minimum_match_score || 65), next.browser_notifications ? 1 : 0).run();
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

async function scheduled(env, controller) {
  if (controller.cron === "*/10 * * * *") {
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
  const due = await env.DB.prepare(`SELECT COUNT(*) AS count FROM outreach WHERE status = 'approved' AND scheduled_for <= CURRENT_TIMESTAMP`).first();
  await activity(env, "followup_check", `${due.count} approved follow-ups are due`);
  return due;
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(env) });
    try {
      const response = await route(request, env);
      const headers = new Headers(response.headers);
      Object.entries(cors(env)).forEach(([key, value]) => headers.set(key, value));
      headers.set("X-Content-Type-Options", "nosniff");
      headers.set("Referrer-Policy", "no-referrer");
      headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
      headers.set("Cache-Control", "no-store");
      return new Response(response.body, { status: response.status, headers });
    } catch (error) {
      return json({ error: error.message || "Unexpected error" }, 500, cors(env));
    }
  },
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(scheduled(env, controller));
  }
};
