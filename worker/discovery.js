import { scoreJob, stripHtml } from "./matching.js";
import { duplicateKey, jobRiskFlags } from "./application-tools.js";
import { feedbackAdjustment } from "./preference-learning.js";

const getJson = async url => {
  const response = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "ApplyPilot/0.2" } });
  if (!response.ok) throw new Error(`Source returned ${response.status}`);
  return response.json();
};

const getText = async url => {
  const response = await fetch(url, { headers: { Accept: "text/html,application/xhtml+xml", "User-Agent": "ApplyPilot/0.3" } });
  if (!response.ok) throw new Error(`Source returned ${response.status}`);
  return response.text();
};

async function greenhouse(source) {
  const data = await getJson(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(source.organization)}/jobs?content=true`);
  return (data.jobs || []).map(job => ({
    externalId: String(job.id),
    provider: "greenhouse",
    company: source.label,
    title: job.title,
    location: job.location?.name || "",
    workplaceType: "",
    description: stripHtml(job.content),
    applyUrl: job.absolute_url,
    salaryText: "",
    publishedAt: job.updated_at || null
  }));
}

async function lever(source) {
  const data = await getJson(`https://api.lever.co/v0/postings/${encodeURIComponent(source.organization)}?mode=json`);
  return (data || []).map(job => ({
    externalId: String(job.id),
    provider: "lever",
    company: source.label,
    title: job.text,
    location: job.categories?.location || "",
    workplaceType: job.workplaceType || "",
    description: job.descriptionPlain || stripHtml(job.description),
    applyUrl: job.applyUrl || job.hostedUrl,
    salaryText: job.salaryDescriptionPlain || "",
    publishedAt: null
  }));
}

async function ashby(source) {
  const data = await getJson(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(source.organization)}`);
  return (data.jobs || []).map(job => ({
    externalId: String(job.id || job.jobUrl), provider: "ashby", company: source.label,
    title: job.title, location: job.location || "", workplaceType: job.isRemote ? "Remote" : "",
    description: stripHtml(job.descriptionHtml || job.descriptionPlain || ""),
    applyUrl: job.applyUrl || job.jobUrl, salaryText: job.compensationTierSummary || "",
    publishedAt: job.publishedAt || null
  }));
}

async function smartrecruiters(source) {
  const data = await getJson(`https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(source.organization)}/postings?limit=100`);
  const jobs = [];
  for (const item of data.content || []) {
    const job = await getJson(`https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(source.organization)}/postings/${encodeURIComponent(item.id)}`);
    const sections = job.jobAd?.sections || {};
    jobs.push({
      externalId: String(job.id), provider: "smartrecruiters", company: source.label,
      title: job.name, location: [job.location?.city, job.location?.region, job.location?.country].filter(Boolean).join(", "),
      workplaceType: job.location?.remote ? "Remote" : "",
      description: stripHtml([sections.jobDescription?.text, sections.qualifications?.text, sections.additionalInformation?.text].filter(Boolean).join(" ")),
      applyUrl: job.applyUrl || `https://jobs.smartrecruiters.com/${source.organization}/${job.id}`,
      salaryText: sections.compensation?.text || "", publishedAt: job.releasedDate || null
    });
  }
  return jobs;
}

async function workable(source) {
  const data = await getJson(`https://www.workable.com/api/accounts/${encodeURIComponent(source.organization)}?details=true`);
  return (data.results || data.jobs || []).map(job => ({
    externalId: String(job.shortcode || job.id), provider: "workable", company: source.label,
    title: job.title, location: job.location?.location_str || [job.city, job.region, job.country].filter(Boolean).join(", ") || "",
    workplaceType: job.location?.workplace_type || (job.remote ? "Remote" : ""), description: stripHtml(job.description || job.description_html || ""),
    applyUrl: job.application_url || job.shortlink || job.url || `https://apply.workable.com/j/${job.shortcode}/`,
    salaryText: typeof job.salary === "object" ? [job.salary.salary_from, job.salary.salary_to, job.salary.salary_currency].filter(Boolean).join(" - ") : job.salary || "", publishedAt: job.published_on || job.created_at || null
  }));
}

async function recruitee(source) {
  const data = await getJson(`https://${encodeURIComponent(source.organization)}.recruitee.com/api/offers/`);
  return (data.offers || []).map(job => ({
    externalId: String(job.id || job.slug), provider: "recruitee", company: source.label,
    title: job.title, location: job.location || job.city || "", workplaceType: job.remote ? "Remote" : "",
    description: stripHtml(job.description || job.requirements || ""), applyUrl: job.careers_url || job.url,
    salaryText: job.salary || "", publishedAt: job.published_at || job.created_at || null
  }));
}

const jsonLdJobs = value => {
  const items = [];
  const visit = node => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== "object") return;
    if (node["@type"] === "JobPosting" || (Array.isArray(node["@type"]) && node["@type"].includes("JobPosting"))) items.push(node);
    if (node["@graph"]) visit(node["@graph"]);
  };
  visit(value);
  return items;
};

async function careerpage(source) {
  const html = await getText(source.organization);
  const scripts = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  const postings = scripts.flatMap(match => {
    try { return jsonLdJobs(JSON.parse(match[1])); } catch { return []; }
  });
  return postings.map((job, index) => {
    const address = job.jobLocation?.address || job.jobLocation?.[0]?.address || {};
    return {
      externalId: String(job.identifier?.value || job.identifier || job.url || index), provider: "careerpage", company: job.hiringOrganization?.name || source.label,
      title: job.title, location: [address.addressLocality, address.addressRegion, address.addressCountry].filter(Boolean).join(", "),
      workplaceType: job.jobLocationType === "TELECOMMUTE" ? "Remote" : "", description: stripHtml(job.description || ""),
      applyUrl: job.url || source.organization, salaryText: job.baseSalary?.value?.value ? String(job.baseSalary.value.value) : "",
      publishedAt: job.datePosted || null
    };
  });
}

export async function fetchSource(source) {
  if (source.provider === "greenhouse") return greenhouse(source);
  if (source.provider === "lever") return lever(source);
  if (source.provider === "ashby") return ashby(source);
  if (source.provider === "smartrecruiters") return smartrecruiters(source);
  if (source.provider === "workable") return workable(source);
  if (source.provider === "recruitee") return recruitee(source);
  if (source.provider === "careerpage") return careerpage(source);
  throw new Error(`Unsupported provider: ${source.provider}`);
}

const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

export async function fetchSourceWithRetry(source, attempts = 3, fetcher = fetchSource) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return { jobs: await fetcher(source), attempts: attempt };
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await wait(100 * (2 ** (attempt - 1)));
    }
  }
  const failure = new Error(lastError?.message || "Source scan failed");
  failure.attempts = attempts;
  throw failure;
}

export async function scanSources(env) {
  const settings = await env.DB.prepare("SELECT * FROM settings WHERE id = 1").first();
  if (settings.search_paused) {
    return { discovered: 0, alreadyTracked: 0, expired: 0, considered: 0, scanned: 0, skipped: {}, errors: [], matches: [], paused: true };
  }
  if (settings.active_from && Date.now() < new Date(`${settings.active_from}T00:00:00Z`).getTime()) {
    return { discovered: 0, expired: 0, scanned: 0, errors: [], matches: [], pausedUntil: settings.active_from };
  }
  await env.DB.prepare("UPDATE task_runs SET status='failed', last_error='Scan lease expired', completed_at=CURRENT_TIMESTAMP WHERE task_type='job_scan' AND status='running' AND started_at < datetime('now', '-15 minutes')").run();
  const activeTask = await env.DB.prepare("SELECT id, started_at FROM task_runs WHERE task_type='job_scan' AND status='running' ORDER BY started_at DESC LIMIT 1").first();
  if (activeTask) {
    return { discovered: 0, alreadyTracked: 0, expired: 0, considered: 0, scanned: 0, skipped: {}, errors: [], matches: [], alreadyRunning: true, taskId: activeTask.id };
  }
  const taskId = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO task_runs (id, task_type, status, max_retries) VALUES (?, 'job_scan', 'running', 2)").bind(taskId).run();
  const profile = await env.DB.prepare("SELECT current_role_start, experience_at_search FROM candidate_profile WHERE id = 1").first();
  if (profile?.current_role_start) {
    const started = new Date(`${profile.current_role_start}-01T00:00:00Z`);
    settings.candidate_years = Math.max(0, (Date.now() - started.getTime()) / 31557600000);
  } else {
    settings.candidate_years = profile?.experience_at_search || null;
  }
  const [standard, external, ats, preferenceRows] = await Promise.all([
    env.DB.prepare("SELECT id, provider, organization, label, enabled, last_scanned_at, last_error, 'sources' AS source_table FROM sources WHERE enabled = 1").all(),
    env.DB.prepare("SELECT id, provider, organization, label, enabled, last_scanned_at, last_error, 'external_sources' AS source_table FROM external_sources WHERE enabled = 1").all(),
    env.DB.prepare("SELECT id, provider, organization, label, enabled, last_scanned_at, last_error, 'ats_sources' AS source_table FROM ats_sources WHERE enabled = 1").all(),
    env.DB.prepare("SELECT feature_key, weight FROM preference_weights").all()
  ]);
  const sources = [...standard.results, ...external.results, ...ats.results];
  const preferenceWeights = Object.fromEntries(preferenceRows.results.map(row => [row.feature_key, row.weight]));
  let discovered = 0;
  let expired = 0;
  let considered = 0;
  let alreadyTracked = 0;
  let retryCount = 0;
  const skipped = { stale: 0, location: 0, experience: 0, salary: 0, excluded: 0, lowFit: 0 };
  const errors = [];
  const matches = [];

  for (const source of sources) {
    const startedAt = Date.now();
    let sourceMatches = 0;
    try {
      const fetched = await fetchSourceWithRetry(source);
      retryCount += fetched.attempts - 1;
      const jobs = fetched.jobs;
      const currentIds = new Set(jobs.map(job => `${job.provider}:${job.externalId}`));
      for (const job of jobs) {
        considered += 1;
        if (job.publishedAt && settings.freshness_hours) {
          const age = Date.now() - new Date(job.publishedAt).getTime();
          if (Number.isFinite(age) && age > Number(settings.freshness_hours) * 3600000) {
            skipped.stale += 1;
            continue;
          }
        }
        const internship = isEarlyCareerJob(job);
        const freelance = isFreelanceJob(job);
        const effectiveSettings = freelance ? { ...settings, alternate_titles: `${settings.alternate_titles || ""},${settings.freelance_titles || ""}`, minimum_salary: null } : internship ? { ...settings, alternate_titles: `${settings.alternate_titles || ""},${settings.internship_titles || ""}`, minimum_salary: null } : settings;
        const match = scoreJob(job, effectiveSettings);
        if (settings.feedback_learning_enabled) {
          const learned = feedbackAdjustment(job, preferenceWeights);
          match.score = Math.max(0, Math.min(100, match.score + learned.adjustment));
          match.eligible = match.score >= Number(effectiveSettings.minimum_match_score || 55);
          if (learned.adjustment) match.reasons.push(`Learned preference ${learned.adjustment > 0 ? "+" : ""}${learned.adjustment}`);
        }
        const id = `${job.provider}:${job.externalId}`;
        // Internship/Freelance hunting is intentionally broader: retain lower-fit roles in the
        // configured location so the user can prioritize pay and transferable skills.
        const broadEligible = (internship || freelance) && !match.reasons.includes("Location conflicts with the no-relocation preference");
        if (!match.eligible && !broadEligible) {
          await env.DB.prepare("UPDATE jobs SET status = 'skipped' WHERE id = ? AND status IN ('new','shortlisted')").bind(id).run();
          const reason = match.reasons[0] || "";
          if (reason.includes("Location conflicts")) skipped.location += 1;
          else if (reason.includes("Requires at least")) skipped.experience += 1;
          else if (reason.includes("salary is below")) skipped.salary += 1;
          else if (reason.includes("excluded keyword")) skipped.excluded += 1;
          else skipped.lowFit += 1;
          continue;
        }
        const opportunityType = freelance ? "freelance" : internship ? "internship" : "full_time";
        const dupKey = duplicateKey(job);
        const existingDup = await env.DB.prepare("SELECT id, score, provider FROM jobs WHERE duplicate_key = ? AND status IN ('new','shortlisted','approved') LIMIT 1").bind(dupKey).first();
        if (existingDup && existingDup.id !== id) {
          if (Number(existingDup.score || 0) >= match.score) {
            skipped.lowFit += 0;
            alreadyTracked += 1;
            continue;
          } else {
            await env.DB.prepare("UPDATE jobs SET status='expired' WHERE id=?").bind(existingDup.id).run();
            expired += 1;
          }
        }
        const result = await env.DB.prepare(`INSERT OR IGNORE INTO jobs
          (id, external_id, source_id, provider, company, title, location, workplace_type, description, apply_url, salary_text, published_at, score, score_reasons, risk_flags, duplicate_key, opportunity_type)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .bind(id, job.externalId, source.source_table === "sources" ? source.id : null, job.provider, job.company, job.title, job.location, job.workplaceType, job.description.slice(0, 30000), job.applyUrl, job.salaryText, job.publishedAt, match.score, JSON.stringify(match.reasons), JSON.stringify(jobRiskFlags(job)), dupKey, opportunityType).run();
        discovered += result.meta.changes || 0;
        if (result.meta.changes) {
          sourceMatches += 1;
          matches.push({ id, title: job.title, company: job.company, location: job.location, score: match.score, applyUrl: job.applyUrl });
        } else alreadyTracked += 1;
      }
      const trackedQuery = source.source_table === "sources"
        ? env.DB.prepare("SELECT id, published_at FROM jobs WHERE source_id = ? AND status IN ('new','shortlisted')").bind(source.id)
        : env.DB.prepare("SELECT id, published_at FROM jobs WHERE provider = ? AND company = ? AND status IN ('new','shortlisted')").bind(source.provider, source.label);
      const { results: tracked } = await trackedQuery.all();
      for (const trackedJob of tracked) {
        const publishedAt = trackedJob.published_at ? new Date(trackedJob.published_at).getTime() : NaN;
        const beyondFreshness = Number.isFinite(publishedAt) && settings.freshness_hours && Date.now() - publishedAt > Number(settings.freshness_hours) * 3600000;
        if (currentIds.has(trackedJob.id) && !beyondFreshness) continue;
        const result = await env.DB.prepare("UPDATE jobs SET status = 'expired' WHERE id = ? AND status IN ('new','shortlisted')").bind(trackedJob.id).run();
        expired += result.meta.changes || 0;
      }
      await env.DB.prepare(`UPDATE ${source.source_table} SET last_scanned_at = CURRENT_TIMESTAMP, last_error = NULL WHERE id = ?`).bind(source.id).run();
      await env.DB.prepare(`INSERT INTO source_scan_runs (id, source_key, provider, label, status, attempts, jobs_seen, new_matches, duration_ms)
        VALUES (?, ?, ?, ?, 'success', ?, ?, ?, ?)`)
        .bind(crypto.randomUUID(), `${source.source_table}:${source.id}`, source.provider, source.label, fetched.attempts, jobs.length, sourceMatches, Date.now() - startedAt).run();
    } catch (error) {
      retryCount += Math.max(0, (error.attempts || 3) - 1);
      errors.push(`${source.label}: ${error.message}`);
      await env.DB.prepare(`UPDATE ${source.source_table} SET last_error = ? WHERE id = ?`).bind(error.message, source.id).run();
      await env.DB.prepare(`INSERT INTO source_scan_runs (id, source_key, provider, label, status, attempts, duration_ms, error)
        VALUES (?, ?, ?, ?, 'failed', ?, ?, ?)`)
        .bind(crypto.randomUUID(), `${source.source_table}:${source.id}`, source.provider, source.label, error.attempts || 3, Date.now() - startedAt, error.message).run();
    }
  }

  // Saved roles are intentionally temporary: keep them for thirty days, then clear them.
  await env.DB.prepare("UPDATE jobs SET status = 'expired' WHERE status = 'shortlisted' AND discovered_at < datetime('now', '-30 days')").run();

  await env.DB.prepare("INSERT INTO activity_log (event_type, message, metadata) VALUES ('scan', ?, ?)")
    .bind(`Job scan completed: ${discovered} new matches, ${alreadyTracked} already tracked, ${expired} expired`, JSON.stringify({ discovered, alreadyTracked, expired, considered, skipped, errors })).run();
  await env.DB.prepare("UPDATE task_runs SET status=?, retry_count=?, last_error=?, metadata=?, completed_at=CURRENT_TIMESTAMP WHERE id=?")
    .bind(errors.length === sources.length && sources.length ? "failed" : "succeeded", retryCount, errors.join("\n") || null, JSON.stringify({ discovered, considered, scanned: sources.length }), taskId).run();
  if (discovered || errors.length) {
    const title = errors.length ? "Job scan completed with source issues" : `${discovered} new match${discovered === 1 ? "" : "es"} found`;
    const message = errors.length ? `${discovered} matches found. ${errors.length} source${errors.length === 1 ? "" : "s"} failed after retries.` : "Fresh official postings are ready for review.";
    await env.DB.prepare("INSERT INTO app_notifications (id, type, title, message) VALUES (?, ?, ?, ?)")
      .bind(crypto.randomUUID(), errors.length ? "warning" : "match", title, message).run();
  }
  return { discovered, alreadyTracked, expired, considered, skipped, scanned: sources.length, errors, matches };
}

function isEarlyCareerJob(job) {
  return /\b(?:intern(?:ship)?|new[ -]?grad|graduate|early[ -]?career|trainee|apprentice|fresher)\b/i.test(`${job.title} ${job.description}`);
}

function isFreelanceJob(job) {
  return /\b(?:freelance|contract(?:or)?|gig|part[ -]?time|hourly|per[ -]?hour|project[ -]?based|upwork|fiverr|toptal|contra)\b/i.test(`${job.title} ${job.description}`);
}
