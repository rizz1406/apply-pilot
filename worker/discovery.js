import { scoreJob, stripHtml } from "./matching.js";
import { duplicateKey, jobRiskFlags } from "./application-tools.js";

const getJson = async url => {
  const response = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "ApplyPilot/0.2" } });
  if (!response.ok) throw new Error(`Source returned ${response.status}`);
  return response.json();
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

export async function fetchSource(source) {
  if (source.provider === "greenhouse") return greenhouse(source);
  if (source.provider === "lever") return lever(source);
  if (source.provider === "ashby") return ashby(source);
  if (source.provider === "smartrecruiters") return smartrecruiters(source);
  throw new Error(`Unsupported provider: ${source.provider}`);
}

export async function scanSources(env) {
  const settings = await env.DB.prepare("SELECT * FROM settings WHERE id = 1").first();
  if (settings.active_from && Date.now() < new Date(`${settings.active_from}T00:00:00Z`).getTime()) {
    return { discovered: 0, expired: 0, scanned: 0, errors: [], matches: [], pausedUntil: settings.active_from };
  }
  const profile = await env.DB.prepare("SELECT current_role_start, experience_at_search FROM candidate_profile WHERE id = 1").first();
  if (profile?.current_role_start) {
    const started = new Date(`${profile.current_role_start}-01T00:00:00Z`);
    settings.candidate_years = Math.max(0, (Date.now() - started.getTime()) / 31557600000);
  } else {
    settings.candidate_years = profile?.experience_at_search || null;
  }
  const [standard, external] = await Promise.all([
    env.DB.prepare("SELECT id, provider, organization, label, enabled, last_scanned_at, last_error, 'sources' AS source_table FROM sources WHERE enabled = 1").all(),
    env.DB.prepare("SELECT id, provider, organization, label, enabled, last_scanned_at, last_error, 'external_sources' AS source_table FROM external_sources WHERE enabled = 1").all()
  ]);
  const sources = [...standard.results, ...external.results];
  let discovered = 0;
  let expired = 0;
  let considered = 0;
  let alreadyTracked = 0;
  const skipped = { stale: 0, location: 0, experience: 0, salary: 0, excluded: 0, lowFit: 0 };
  const errors = [];
  const matches = [];

  for (const source of sources) {
    try {
      const jobs = await fetchSource(source);
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
        const internshipSettings = internship ? { ...settings, alternate_titles: `${settings.alternate_titles || ""},${settings.internship_titles || ""}`, minimum_salary: null } : settings;
        const match = scoreJob(job, internshipSettings);
        const id = `${job.provider}:${job.externalId}`;
        // Internship hunting is intentionally broader: retain lower-fit roles in the
        // configured location so the user can prioritize pay and transferable skills.
        const internshipEligible = internship && match.score >= 40 && !match.reasons.includes("Location conflicts with the no-relocation preference");
        if (!match.eligible && !internshipEligible) {
          await env.DB.prepare("UPDATE jobs SET status = 'skipped' WHERE id = ? AND status IN ('new','shortlisted')").bind(id).run();
          const reason = match.reasons[0] || "";
          if (reason.includes("Location conflicts")) skipped.location += 1;
          else if (reason.includes("Requires at least")) skipped.experience += 1;
          else if (reason.includes("salary is below")) skipped.salary += 1;
          else if (reason.includes("excluded keyword")) skipped.excluded += 1;
          else skipped.lowFit += 1;
          continue;
        }
        const result = await env.DB.prepare(`INSERT OR IGNORE INTO jobs
          (id, external_id, source_id, provider, company, title, location, workplace_type, description, apply_url, salary_text, published_at, score, score_reasons, risk_flags, duplicate_key, opportunity_type)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .bind(id, job.externalId, source.source_table === "sources" ? source.id : null, job.provider, job.company, job.title, job.location, job.workplaceType, job.description.slice(0, 30000), job.applyUrl, job.salaryText, job.publishedAt, match.score, JSON.stringify(match.reasons), JSON.stringify(jobRiskFlags(job)), duplicateKey(job), internship ? "internship" : "full_time").run();
        discovered += result.meta.changes || 0;
        if (result.meta.changes) {
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
    } catch (error) {
      errors.push(`${source.label}: ${error.message}`);
      await env.DB.prepare(`UPDATE ${source.source_table} SET last_error = ? WHERE id = ?`).bind(error.message, source.id).run();
    }
  }

  await env.DB.prepare("INSERT INTO activity_log (event_type, message, metadata) VALUES ('scan', ?, ?)")
    .bind(`Job scan completed: ${discovered} new matches, ${alreadyTracked} already tracked, ${expired} expired`, JSON.stringify({ discovered, alreadyTracked, expired, considered, skipped, errors })).run();
  return { discovered, alreadyTracked, expired, considered, skipped, scanned: sources.length, errors, matches };
}

function isEarlyCareerJob(job) {
  return /\b(?:intern(?:ship)?|new[ -]?grad|graduate|early[ -]?career|trainee|apprentice|fresher)\b/i.test(`${job.title} ${job.description}`);
}
