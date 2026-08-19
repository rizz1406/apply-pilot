const STORAGE_KEY = "applypilot-state-v2";
const API_TOKEN_KEY = "applypilot-api-token";
const API_BASE = location.port === "4173" ? "http://127.0.0.1:8787/api" : "https://applypilot-api.rizwanmirza95551.workers.dev/api";
let remoteEnabled = false;
const SOURCE_PRESETS = [
  { provider: "ashby", organization: "sarvam", label: "Sarvam" },
  { provider: "ashby", organization: "atlan", label: "Atlan" },
  { provider: "ashby", organization: "certifyos", label: "CertifyOS" },
  { provider: "ashby", organization: "g2", label: "G2" },
  { provider: "ashby", organization: "parker", label: "Parker" },
  { provider: "ashby", organization: "valerie-group", label: "Valerie Group" },
  { provider: "ashby", organization: "maneuver-marketing", label: "Maneuver Marketing" },
  { provider: "ashby", organization: "mem0", label: "Mem0" },
  { provider: "ashby", organization: "flagright.com", label: "Flagright" },
  { provider: "lever", organization: "shopback-2", label: "ShopBack" },
  { provider: "greenhouse", organization: "databricks", label: "Databricks" }
];

const seedState = {
  activeView: "today",
  scannedAt: null,
  profile: { fullName: "Rizwan Baig", currentTitle: "Data Analyst", homeLocation: "Hyderabad, India" },
  settings: {
    role: "Data Analyst",
    location: "Hyderabad / Remote India",
    alternateTitles: "Business Intelligence Analyst,BI Analyst,Reporting Analyst,Digital Analytics Analyst,Web Analytics Analyst,AdTech Data Analyst,Ad Operations Analyst,Marketing Data Analyst,SQL Data Analyst,Junior Analytics Engineer,Junior BI Developer",
    requiredSkills: "SQL,BigQuery,GA4,Google Analytics,Google Ad Manager,GAM,Looker Studio,Power BI,Python,ETL,GCP,Excel,Data QA,query optimization",
    excludedKeywords: "unpaid internship,commission only",
    followupDays: 5,
    dailyLimit: 8,
    minimumSalary: 700000,
    approval: true,
    followups: true,
    telegram: false
  },
  jobs: [],
  applications: [],
  outreach: [],
  activity: [],
  leads: [],
  sources: []
};

const navItems = [
  { id: "internships", label: "Early career", glyph: "I" },
  { id: "today", label: "Review", glyph: "⌂" },
  { id: "pipeline", label: "Pipeline", glyph: "▥" },
  { id: "outreach", label: "Outreach", glyph: "✉" },
  { id: "settings", label: "Settings", glyph: "⚙" }
];

let state = loadState();
const app = document.querySelector("#app");
const dialog = document.querySelector("#detail-dialog");
const operationOverlay = document.querySelector("#operation-overlay");
const pendingApprovals = new Set();
dialog.addEventListener("close", () => { dialog.className = ""; });

async function api(path, options = {}) {
  const token = localStorage.getItem(API_TOKEN_KEY);
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed with ${response.status}`);
  return data;
}

function parseJson(value, fallback) {
  try { return JSON.parse(value); } catch { return fallback; }
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function mapRemote(data) {
  const colors = ["#2457d6", "#6d4ec7", "#0f766e", "#b45309", "#166534"];
  state.jobs = data.jobs.map((job, index) => ({
    id: job.id, title: job.title, company: job.company,
    initials: job.company.split(/\s+/).map(part => part[0]).join("").slice(0, 2).toUpperCase(),
    color: colors[index % colors.length], location: job.location || "Location not listed",
    mode: job.workplace_type || "Review", salary: job.salary_text || "Salary not listed",
    source: job.provider, score: job.score, age: job.discovered_at, status: job.status, opportunityType: job.opportunity_type || "full_time",
    reasons: parseJson(job.score_reasons, []), riskFlags: parseJson(job.risk_flags, []), applyUrl: job.apply_url, description: job.description
  }));
  const stageMap = { approved: "approved", prepared: "prepared", applied: "applied", outreach: "outreach", interview: "interview", offer: "interview", rejected: "closed", withdrawn: "closed" };
  state.applications = data.applications.map(item => ({ id: item.id, title: item.title, company: item.company, stage: stageMap[item.stage] || "prepared", updated: item.updated_at, submittedAt: item.submitted_at, score: item.score, applyUrl: item.apply_url, rawStage: item.stage, opportunityType: item.opportunity_type || "full_time",
    tailoredResumeId: item.tailored_resume_id, tailoredResume: parseJson(item.tailored_resume_json, null), resumeAudit: parseJson(item.resume_audit_json, null), keywordCoverage: parseJson(item.keyword_coverage, null), tailoredScore: item.tailored_match_score, latex: item.latex_content, tailoredStatus: item.tailored_status, coverLetter: item.cover_letter }));
  state.outreach = data.outreach.map(item => ({
    id: item.id, applicationId: item.application_id, name: item.recruiter_name || "Recruiter not assigned", email: item.recruiter_email || "",
    company: item.company, role: item.role, subject: item.subject, body: item.body, status: item.status,
    label: item.status, timing: item.sent_at || item.scheduled_for || item.updated_at || "Not scheduled"
  }));
  state.activity = data.activity.map(item => ({ text: item.message, time: item.created_at }));
  state.sources = data.sources || [];
  state.leads = data.leads || [];
  state.resumeVariants = data.resumeVariants || [];
  state.analytics = data.analytics || {};
  state.contacts = data.contacts || [];
  state.answers = data.answers || [];
  state.interviews = data.interviews || [];
  if (data.profile?.full_name) {
    state.profile = { fullName: data.profile.full_name, email: data.profile.email, currentTitle: data.profile.current_title, homeLocation: data.profile.home_location, targetSalary: data.profile.target_salary, stretchSalary: data.profile.stretch_salary };
  }
  if (data.settings) {
    state.settings = {
      ...state.settings,
      role: data.settings.target_role,
      location: data.settings.preferred_locations,
      dailyLimit: data.settings.daily_application_limit,
      minimumSalary: data.settings.minimum_salary,
      approval: Boolean(data.settings.require_approval),
      followups: Boolean(data.settings.followups_enabled),
      alternateTitles: data.settings.alternate_titles,
      requiredSkills: data.settings.required_skills,
      excludedKeywords: data.settings.excluded_keywords,
      followupDays: data.settings.followup_days
      ,activeFrom: data.settings.active_from || ""
      ,freshnessHours: data.settings.freshness_hours || 72
      ,minimumMatchScore: data.settings.minimum_match_score || 65
      ,browserNotifications: Boolean(data.settings.browser_notifications)
      ,tailoringMinimumScore: data.settings.tailoring_minimum_score || 75
      ,mustHaveSkills: data.settings.must_have_skills || ""
      ,internshipTitles: data.settings.internship_titles || "Data Analyst Intern,Business Intelligence Intern,Data Engineering Intern,Analytics Intern"
      ,experienceToleranceYears: data.settings.experience_tolerance_years ?? 2
      ,searchPaused: Boolean(data.settings.search_paused)
    };
  }
}

async function connectBackend(quiet = true) {
  try {
    const previousJobs = new Set((state.jobs || []).map(job => String(job.id)));
    const data = await api("/bootstrap");
    mapRemote(data);
    remoteEnabled = true;
    saveState();
    render();
    const newJobs = state.jobs.filter(job => !previousJobs.has(String(job.id)));
    if (newJobs.length && state.settings.browserNotifications && "Notification" in window && Notification.permission === "granted") {
      new Notification(`ApplyPilot found ${newJobs.length} new match${newJobs.length === 1 ? "" : "es"}`, { body: newJobs.slice(0, 2).map(job => `${job.title} at ${job.company}`).join("\n"), icon: "./icon.svg" });
    }
    if (!quiet) toast("Connected to the cloud backend.");
  } catch (error) {
    remoteEnabled = false;
    toast(`Cloud data could not load: ${error.message}`, { title: "Connection problem", tone: "error", duration: 6000 });
  }
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return saved ? { ...structuredClone(seedState), ...saved } : structuredClone(seedState);
  } catch {
    return structuredClone(seedState);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function counts() {
  return {
    today: state.jobs.filter(isReviewMatch).length,
    internships: state.jobs.filter(job => job.status === "new" && job.opportunityType === "internship").length,
    pipeline: state.applications.filter(item => item.stage !== "closed").length,
    outreach: state.outreach.filter(item => item.status !== "sent").length,
    settings: ""
  };
}

function isReviewMatch(job) {
  const minimumScore = Number(state.settings.minimumMatchScore || 50);
  return job.status === "new" && job.opportunityType !== "internship" && Number(job.score || 0) >= minimumScore;
}

function renderNav(activeView) {
  const totals = counts();
  const markup = navItems.map(item => `
    <button class="nav-button ${activeView === item.id ? "active" : ""}" data-view="${item.id}">
      <span class="nav-glyph" aria-hidden="true">${item.glyph}</span>
      <span>${item.label}</span>
      <span class="nav-count">${totals[item.id]}</span>
    </button>`).join("");
  document.querySelector(".desktop-nav").innerHTML = markup;
  document.querySelector(".mobile-nav").innerHTML = markup;
}

function render() {
  const titles = { today: "Review jobs", internships: "Early Career & Internships", pipeline: "Application pipeline", outreach: "Recruiter outreach", settings: "Preferences" };
  const activeView = titles[state.activeView] ? state.activeView : "today";
  document.querySelector("#page-title").textContent = titles[activeView];
  const initials = state.profile.fullName.split(/\s+/).map(part => part[0]).join("").slice(0, 2).toUpperCase();
  document.querySelector(".sidebar-profile .avatar").textContent = initials;
  document.querySelector(".sidebar-profile strong").textContent = state.profile.fullName;
  document.querySelector(".sidebar-profile small").textContent = state.profile.currentTitle;
  const action = document.querySelector("#demo-action");
  const scanToggle = document.querySelector("#scan-toggle");
  const agentStatus = document.querySelector(".agent-status span");
  const paused = Boolean(state.settings.searchPaused);
  scanToggle.textContent = paused ? "Resume scans" : "Pause scans";
  scanToggle.classList.toggle("danger-button", !paused);
  agentStatus.textContent = paused ? "Scans paused" : "10-min scan active";
  action.textContent = activeView === "today" || activeView === "internships" ? "Run job scan" : activeView === "settings" ? "Save changes" : "Add item";
  renderNav(activeView);
  const viewRenderers = {
    today: renderToday,
    internships: renderInternships,
    pipeline: renderPipeline,
    outreach: renderOutreach,
    settings: renderSettings
  };
  try {
    viewRenderers[activeView]();
  } catch (error) {
    console.error(`Failed to render ${activeView}`, error);
    app.innerHTML = `<div class="empty-state render-error"><h2>This view could not load</h2><p>${escapeHtml(error.message)}</p><button class="primary-button" data-action="reload-view">Try again</button></div>`;
  }
  bindViewEvents();
}

function renderToday() {
  const available = state.jobs.filter(isReviewMatch);
  const saved = state.jobs.filter(job => job.status === "shortlisted" && job.opportunityType !== "internship");
  const reviewFilter = state.reviewFilter || "matches";
  const visible = reviewFilter === "saved" ? saved : reviewFilter === "strong" ? available.filter(job => job.score >= 75) : available;
  const reviewTotal = available.length;
  const activeApps = state.applications.filter(item => item.stage !== "closed").length;
  const interviews = state.applications.filter(item => ["interview", "offer"].includes(item.rawStage || item.stage)).length;
  const followupsReady = state.outreach.filter(item => item.status === "draft" || item.status === "approved").length;
  const reviewPercent = reviewTotal ? 0 : 100;
  app.innerHTML = `
    <section class="focus-strip">
      <div class="focus-copy">
        <span>Next best action</span>
        <h2>${reviewTotal ? `Review ${reviewTotal} new ${reviewTotal === 1 ? "opportunity" : "opportunities"}` : "Your review queue is clear"}</h2>
        <p>${available.length ? `${available.length} automatically scored ${available.length === 1 ? "match is" : "matches are"} ready for review.` : "The agent will notify you when new official opportunities arrive."}</p>
      </div>
      <div class="focus-progress"><div><span>Pending review</span><strong>${reviewTotal}</strong></div><div class="focus-progress-bar"><i style="width:${reviewPercent}%"></i></div></div>
    </section>
    <section class="summary-grid" aria-label="Job search summary">
      ${filterMetric("New matches", available.length, "matches")}
      ${filterMetric("Strong matches", available.filter(job => job.score >= 75).length, "strong")}
      ${filterMetric("Saved for later", saved.length, "saved")}
      ${metric("Applied / follow-up", `${activeApps} / ${followupsReady}`, "Pipeline and drafts")}
    </section>
    <div class="content-grid">
      <section>
        <div class="section-heading"><div><h2>${reviewFilter === "saved" ? "Saved for later" : reviewFilter === "strong" ? "Strong matches" : "New matches"}</h2><p>${reviewFilter === "saved" ? "Saved roles are held for 30 days, then removed automatically." : "Each role must pass target-title, skill, India/remote, and experience checks."}</p></div><div class="section-actions"><button class="text-button" data-action="show-matches" data-filter="matches">All</button><button class="text-button" data-action="show-matches" data-filter="strong">Strong</button><button class="text-button" data-action="show-matches" data-filter="saved">Saved</button><button class="text-button" data-action="${remoteEnabled ? "scan" : "reset"}">${remoteEnabled ? "Refresh" : "Reset demo"}</button></div></div>
        <div class="job-list">
          ${visible.length ? visible.map(jobCard).join("") : `<div class="empty-state"><h2>${reviewFilter === "saved" ? "No saved roles" : "No current matches"}</h2><p>${reviewFilter === "saved" ? "Use Save for later on a role you may apply to within 30 days." : "The scanner is running, but it will not fill this list with weak full-time matches."}</p><button class="primary-button" data-action="scan">Run job scan</button></div>`}
        </div>
      </section>
      <aside class="panel activity-panel">
        <div class="section-heading"><div><h2>Agent activity</h2><p>Latest automated actions</p></div></div>
        <div class="activity-list">${state.activity.slice(0, 5).map(item => `<div class="activity-item"><span class="activity-dot"></span><p>${item.text}</p><time>${item.time}</time></div>`).join("")}</div>
        <div class="ai-usage"><small>AI resume packs created</small><strong>${state.analytics?.tailored_packs || 0}</strong><small>Provider quota is checked only when a tailored pack is requested.</small></div>
      </aside>
    </div>`;
}

function metric(label, value, note) {
  return `<article class="metric"><span>${label}</span><strong>${value}</strong><small>${note}</small></article>`;
}

function filterMetric(label, value, filter) {
  return `<button class="metric metric-button" data-action="show-matches" data-filter="${filter}"><span>${label}</span><strong>${value}</strong><small>View list</small></button>`;
}

function jobCard(job) {
  const skillReason = job.reasons.find(reason => /preferred skills found/i.test(reason)) || "Skill overlap needs JD review";
  const experienceReason = job.reasons.find(reason => /experience requirement|seniority/i.test(reason)) || "Experience level checked";
  const fitLabel = job.score >= 90 ? "Strong match" : job.score >= 75 ? "Good match" : "Eligible match";
  const readiness = job.score >= 75 ? "STRONG FIT" : "REVIEW FIT";
  return `<article class="job-card" data-job-id="${job.id}">
    <div class="company-logo" style="background:${job.color}">${job.initials}</div>
    <div>
      <div class="match-summary"><strong>${job.score}% ${fitLabel}</strong><span>${escapeHtml(skillReason)}</span><span>${escapeHtml(experienceReason)}</span></div><div class="job-title-row"><h3 class="job-title">${job.title}</h3><span class="badge new">${readiness}</span></div>
      <p class="job-company">${job.company}</p>${job.riskFlags?.length ? `<p class="risk-note">Review: ${escapeHtml(job.riskFlags.join("; "))}</p>` : ""}
      <div class="job-meta"><span>${job.location}</span><span>${job.mode}</span><span>${job.salary}</span><span>${job.source}</span></div>
    </div>
    <div class="score-block"><div class="score">${job.score}%</div><div class="score-label">MATCH</div></div>
    <div class="job-actions">
      <button class="secondary-button" data-action="skip" data-id="${job.id}">Skip</button>
      <button class="secondary-button" data-action="save" data-id="${job.id}">Save for later</button>
      <button class="secondary-button" data-action="details" data-id="${job.id}">Review</button>
      <button class="primary-button" data-action="approve" data-id="${job.id}">Prepare application</button>
    </div>
  </article>`;
}

function renderInternships() {
  const internships = state.jobs.filter(job => job.status === "new" && job.opportunityType === "internship");
  const prepared = state.applications.filter(item => item.opportunityType === "internship" && !["closed", "rejected"].includes(item.rawStage));
  const preparedMarkup = prepared.length ? `<section class="section-stack"><div class="section-heading"><div><h2>Your early-career applications</h2><p>Prepared roles stay visible here until they are closed, so you can return to the resume pack and follow-up history.</p></div></div><div class="internship-list">${prepared.map(item => `<article class="internship-card prepared-internship"><div class="internship-head"><div><span class="lead-provider">${escapeHtml(item.stage).toUpperCase()}</span><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.company)}</p></div><strong>${item.tailoredScore || item.score || 0}% fit</strong></div><div class="internship-facts"><span><small>Stage</small>${escapeHtml(item.stage === "approved" ? "Ready to apply" : item.stage)}</span><span><small>Resume</small>${item.tailoredResumeId ? "Tailored pack saved" : "Not created"}</span><span><small>Updated</small>${escapeHtml(item.updated || "Recently")}</span></div><div class="internship-actions"><button class="secondary-button" data-action="review-pack" data-id="${escapeHtml(item.id)}">Review resume pack</button><button class="secondary-button" data-action="open-application" data-url="${escapeHtml(item.applyUrl || "")}">Open application</button></div></article>`).join("")}</div></section>` : "";
  app.innerHTML = `<section class="focus-strip"><div class="focus-copy"><span>Official early-career roles</span><h2>${internships.length ? `${internships.length} early-career opportunit${internships.length === 1 ? "y" : "ies"}` : prepared.length ? "Your early-career application is ready" : "No early-career opportunities yet"}</h2><p>This is intentionally broader: internships, graduate, trainee, apprentice, and fresher roles from official boards. Pay and transferable skills are shown before you spend time applying.</p></div></section><section class="summary-grid"><article class="metric"><span>Open early-career roles</span><strong>${internships.length}</strong><small>Official postings only</small></article><article class="metric"><span>Prepared applications</span><strong>${prepared.length}</strong><small>Kept here for tracking</small></article><article class="metric"><span>Search approach</span><strong>Broad</strong><small>Includes transferable roles</small></article><article class="metric"><span>Freshness window</span><strong>${state.settings.freshnessHours || 72}h</strong><small>Older postings are hidden</small></article></section><div class="section-heading"><div><h2>Early Career & Internships</h2><p>Automatically scored official postings with pay, skills, timing, and a short summary.</p></div><button class="text-button" data-action="scan">Refresh sources</button></div><div class="internship-list">${internships.length ? internships.map(internshipCard).join("") : `<div class="empty-state"><h2>No current early-career match</h2><p>The last official-board scan did not return an internship, graduate, trainee, apprentice, or fresher role that fits the India-wide search. Refreshing checks the boards again.</p><button class="primary-button" data-action="scan">Run job scan</button></div>`}</div>${preparedMarkup}`;
}

function internshipCard(job) {
  const skillPool = String(state.settings.requiredSkills || "").split(",").map(skill => skill.trim()).filter(Boolean);
  const skills = skillPool.filter(skill => String(job.description || "").toLowerCase().includes(skill.toLowerCase())).slice(0, 4);
  const timing = job.age ? new Intl.DateTimeFormat("en", { day: "numeric", month: "short" }).format(new Date(job.age)) : "Posting date not listed";
  const pay = job.salary && job.salary !== "Salary not listed" ? job.salary : "Pay not listed";
  const sentence = String(job.description || "").replace(/\s+/g, " ").split(/(?<=[.!?])\s/)[0] || "Official early-career posting. Open the job details to check requirements.";
  const eligibleForPack = job.score >= Number(state.settings.tailoringMinimumScore || 50);
  const summary = `${sentence.slice(0, 260)} ${skills.length ? `Relevant skills found: ${skills.join(", ")}.` : "The role has limited overlap with your analyst profile, so it is shown as a transferable-skills option."}`;
  return `<article class="internship-card"><div class="internship-head"><div><span class="lead-provider">${escapeHtml(job.source)} | OFFICIAL BOARD</span><h3>${escapeHtml(job.title)}</h3><p>${escapeHtml(job.company)} | ${escapeHtml(job.location)}</p></div><strong>${job.score}% fit</strong></div><div class="internship-facts"><span><small>Pay</small>${escapeHtml(pay)}</span><span><small>Posted</small>${escapeHtml(timing)}</span><span><small>Relevant skills</small>${escapeHtml(skills.join(", ") || "Transferable role")}</span></div><div class="internship-actions"><button class="secondary-button" data-action="toggle-intern-summary" data-id="${escapeHtml(job.id)}">What this role is</button><button class="secondary-button" data-action="details" data-id="${escapeHtml(job.id)}">Review JD</button>${eligibleForPack ? `<button class="primary-button" data-action="approve" data-id="${escapeHtml(job.id)}">Prepare resume</button>` : `<button class="secondary-button" data-action="details" data-id="${escapeHtml(job.id)}">Below resume gate</button>`}</div><p class="internship-summary" id="intern-summary-${escapeHtml(job.id)}" hidden>${escapeHtml(summary)}</p></article>`;
}

function renderPipeline() {
  const stages = [
    { id: "prepared", label: "Prepared" }, { id: "approved", label: "Ready to apply" }, { id: "applied", label: "Applied" }, { id: "outreach", label: "Outreach" },
    { id: "interview", label: "Interviewing" }, { id: "closed", label: "Closed" }
  ];
  const analytics = state.analytics || {};
  const analyticsRows = (title, rows) => rows?.length ? `<section class="panel analytics-panel"><h3>${title}</h3>${rows.map(row => `<div class="analytics-row"><span>${escapeHtml(row.label)}</span><strong>${row.applications} applied</strong><small>${row.interviews || 0} interviews</small></div>`).join("")}</section>` : "";
  app.innerHTML = `<section class="summary-grid" aria-label="Search analytics">${metric("Discovered", analytics.discovered || 0, "All time")}${metric("Applied", analytics.applied || 0, "Confirmed")}${metric("Interviews", analytics.interviews || 0, "Interview or offer")}${metric("Offers", analytics.offers || 0, "Tracked")}</section><div class="analytics-grid">${analyticsRows("Results by target role", analytics.byRole)}${analyticsRows("Results by source", analytics.bySource)}</div><div class="section-heading"><div><h2>${state.applications.length} tracked applications</h2><p>Every application keeps its documents, messages and history together</p></div></div>
    <section class="pipeline"><div class="pipeline-grid">${stages.map(stage => {
      const items = state.applications.filter(item => item.stage === stage.id);
      return `<div class="pipeline-column"><div class="pipeline-header"><span>${stage.label}</span><span>${items.length}</span></div>${items.map(item => `
        <article class="pipeline-card"><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.company)}</p><div class="application-meta"><span>${item.tailoredResumeId ? "Tailored ATS pack saved" : "Application documents pending"}</span>${item.submittedAt ? `<span>Applied ${escapeHtml(item.submittedAt)}</span>` : `<span>Updated ${escapeHtml(item.updated)}</span>`}</div>${item.tailoredResumeId ? `<button class="text-button" data-action="review-pack" data-id="${escapeHtml(item.id)}">Review resume, audit & history</button>` : ""}<footer><span>${item.updated}</span><span>${item.tailoredScore || item.score}% match</span></footer></article>`).join("")}</div>`;
    }).join("")}</div></section>`;
}

function renderOutreach() {
  const pending = state.outreach.filter(item => item.status === "draft" || item.status === "approved").length;
  app.innerHTML = `<div class="section-heading"><div><h2>Email queue</h2><p>${pending ? `${pending} follow-up${pending === 1 ? "" : "s"} awaiting approval` : "Follow-ups stop automatically when a recruiter replies"}</p></div></div>
    <section class="panel outreach-wrap"><table class="outreach-table"><thead><tr><th>Contact</th><th>Opportunity</th><th>Status</th><th>Timing</th><th></th></tr></thead><tbody>
      ${state.outreach.length ? state.outreach.map(item => `<tr><td class="contact-cell"><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.email || item.company)}</span></td><td>${escapeHtml(item.role)}</td><td><span class="status ${escapeHtml(item.status)}">${escapeHtml(item.label)}</span></td><td>${escapeHtml(item.timing)}</td><td>${["draft", "approved"].includes(item.status) ? `<button class="primary-button compact-button" data-action="approve-send-followup" data-id="${escapeHtml(item.id)}">Approve & send</button>` : `<button class="text-button" data-action="outreach" data-id="${escapeHtml(item.id)}">View</button>`}</td></tr>`).join("") : `<tr><td colspan="5" class="empty-row">No recruiter follow-ups yet. Create one from a prepared application.</td></tr>`}
    </tbody></table></section>`;
}

function renderSettings() {
  const s = state.settings;
  app.innerHTML = `<div class="settings-grid">
    <section class="panel settings-section"><h2>Search profile</h2>
      <div class="field"><label for="role">Primary target designation</label><input id="role" value="${escapeHtml(s.role)}"><small>Your highest-priority role for matching.</small></div>
      <div class="field"><label for="alternate-titles">Additional target designations</label><textarea id="alternate-titles" rows="4" placeholder="Business Intelligence Analyst, Analytics Engineer, Junior Data Engineer">${escapeHtml(s.alternateTitles || "")}</textarea><small>Enter multiple roles separated by commas. Every role is included in job matching.</small></div>
      <div class="field"><label for="internship-titles">Internship designations</label><textarea id="internship-titles" rows="3" placeholder="Data Analyst Intern, Business Intelligence Intern">${escapeHtml(s.internshipTitles || "Data Analyst Intern,Business Intelligence Intern,Data Engineering Intern,Analytics Intern")}</textarea><small>These appear in the separate Internships section.</small></div>
      <div class="field"><label for="location">Preferred location</label><input id="location" value="${s.location}"></div>
      <div class="field"><label for="skills">Required skills</label><input id="skills" value="${s.requiredSkills || "JavaScript,TypeScript,React,Node.js"}"></div>
      <div class="field"><label for="minimum-salary">Minimum CTC (LPA)</label><input id="minimum-salary" type="number" min="1" step="0.5" value="${(s.minimumSalary || 700000) / 100000}"><small>Target: ₹8-10 LPA · Stretch: ₹10-12 LPA</small></div>
      <div class="field"><label for="limit">Maximum applications per day</label><input id="limit" type="number" min="1" max="25" value="${s.dailyLimit}"></div>
      <div class="field"><label for="active-from">Activate search on</label><input id="active-from" type="date" value="${s.activeFrom || ""}"><small>Leave empty to scan now.</small></div>
      <div class="field"><label for="freshness">Maximum posting age (hours)</label><input id="freshness" type="number" min="24" max="720" value="${s.freshnessHours || 168}"><small>Seven days is recommended: older postings are hidden from new-match lists.</small></div>
      <div class="field"><label for="experience-tolerance">Experience gap allowed (years)</label><input id="experience-tolerance" type="number" min="0" max="3" step="0.5" value="${s.experienceToleranceYears ?? 1}"><small>Allows promising roles where the stated experience requirement is above your current experience.</small></div>
      <div class="field"><label for="match-score">Minimum match score</label><input id="match-score" type="number" min="50" max="95" value="${s.minimumMatchScore || 65}"></div>
      <div class="field"><label for="tailoring-score">Resume tailoring gate</label><input id="tailoring-score" type="number" min="65" max="95" value="${s.tailoringMinimumScore || 75}"><small>Only roles at or above this score can create a resume pack.</small></div>
      <div class="field"><label for="must-have-skills">Required skills for tailoring</label><input id="must-have-skills" value="${escapeHtml(s.mustHaveSkills || "")}" placeholder="SQL, BigQuery"><small>Every listed skill must appear in the full JD.</small></div>
    </section>
    <section class="panel settings-section"><h2>Automation controls</h2>
      ${toggle("approval", "Approve every application", s.approval)}
      ${toggle("followups", "Prepare automatic follow-ups", s.followups)}
      ${toggle("browserNotifications", "Browser notifications", s.browserNotifications)}
      <div class="field" style="margin-top:16px"><label for="api-token">Private API token</label><input id="api-token" type="password" placeholder="Only needed after deployment" value="${localStorage.getItem(API_TOKEN_KEY) || ""}"></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:20px"><button class="secondary-button" data-action="connect">Test backend</button><button class="secondary-button" data-action="export-data">Export data</button>${remoteEnabled ? "" : `<button class="secondary-button danger-button" data-action="reset">Reset demo</button>`}</div>
    </section>
    <section class="panel settings-section" style="grid-column:1/-1"><h2>Job sources</h2>
      <div class="preset-row"><strong>Recommended public boards</strong><span>${SOURCE_PRESETS.map(source => `<button class="preset-button" data-action="add-preset" data-preset="${source.organization}">${source.label}</button>`).join("")}</span></div>
      <div class="settings-grid"><div class="field"><label for="source-provider">Provider</label><select id="source-provider"><option value="greenhouse">Greenhouse</option><option value="lever">Lever</option><option value="ashby">Ashby</option><option value="smartrecruiters">SmartRecruiters</option></select></div><div class="field"><label for="source-org">Board identifier</label><input id="source-org" placeholder="Example: companyname"></div></div>
      <div class="field"><label for="source-label">Company label</label><input id="source-label" placeholder="Company name shown in the app"></div>
      <button class="secondary-button" data-action="add-source">Add source</button>
      <div class="job-list" style="margin-top:14px">${(state.sources || []).map(source => `<div class="toggle-row"><span><strong>${source.label}</strong> · ${source.provider}/${source.organization}</span><button class="text-button danger-button" data-action="delete-source" data-id="${source.id}">Remove</button></div>`).join("") || `<p class="job-company">No live sources configured yet.</p>`}</div>
    </section>
    <section class="panel settings-section" style="grid-column:1/-1"><h2>Resume variants</h2><div class="job-list">${(state.resumeVariants || []).map(variant => `<div class="toggle-row"><span><strong>${escapeHtml(variant.name)}</strong><small>${escapeHtml(variant.target_titles)}</small></span><span class="badge">${escapeHtml(variant.filename)}</span></div>`).join("") || `<p class="job-company">No variants configured.</p>`}</div></section>
    <section class="panel settings-section" style="grid-column:1/-1"><h2>Application answer library</h2><p class="job-company">Save verified answers for protected application forms. Copy them into official portals; ApplyPilot does not auto-submit forms.</p><div class="settings-grid">${[{ key: "notice_period", label: "Notice period" }, { key: "expected_ctc", label: "Expected CTC" }, { key: "work_authorization", label: "Work authorization" }, { key: "linkedin", label: "LinkedIn URL" }, { key: "portfolio", label: "Portfolio URL" }].map(field => { const answer = (state.answers || []).find(item => item.key === field.key) || {}; return `<div class="field"><label for="answer-${field.key}">${field.label}</label><input id="answer-${field.key}" value="${escapeHtml(answer.value || "")}" placeholder="Add your verified answer"></div>`; }).join("")}</div><button class="secondary-button" data-action="save-answers">Save answer library</button></section>
  </div>`;
}

function toggle(id, label, active) {
  return `<div class="toggle-row"><span>${label}</span><button class="switch ${active ? "on" : ""}" role="switch" aria-checked="${active}" data-toggle="${id}" aria-label="${label}"></button></div>`;
}

function bindViewEvents() {
  app.querySelectorAll("[data-action]").forEach(button => button.addEventListener("click", handleAction));
  app.querySelectorAll("[data-toggle]").forEach(button => button.addEventListener("click", () => {
    const key = button.dataset.toggle;
    state.settings[key] = !state.settings[key];
    saveState(); render();
  }));
}

async function handleAction(event) {
  const { action, id } = event.currentTarget.dataset;
  if (action === "reload-view") return render();
  if (action === "approve") return await approveJob(id);
  if (action === "skip") updateJob(id, "skipped", "Job skipped and removed from your queue");
  if (action === "save") updateJob(id, "shortlisted", "Saved for later. This role is retained for 30 days.");
  if (action === "show-matches") { state.reviewFilter = event.currentTarget.dataset.filter || "matches"; saveState(); render(); }
  if (action === "details") showJob(id);
  if (action === "open-application") {
    const applyUrl = event.currentTarget.dataset.url;
    if (applyUrl) window.open(applyUrl, "_blank", "noopener,noreferrer");
    else toast("The official application URL is not available for this record.", { title: "Application link unavailable" });
  }
  if (action === "reset") resetDemo();
  if (action === "scan") runScan();
  if (action === "outreach") reviewOutreach(id);
  if (action === "connect") {
    localStorage.setItem(API_TOKEN_KEY, document.querySelector("#api-token").value.trim());
    await connectBackend(false);
  }
  if (action === "add-source") await addSource();
  if (action === "add-preset") await addPreset(event.currentTarget.dataset.preset);
  if (action === "save-answers") await saveAnswerLibrary();
  if (action === "delete-source") await deleteSource(id);
  if (action === "toggle-intern-summary") toggleInternSummary(id);
  if (action === "export-data") await exportData();
  if (action === "review-pack") showApplicationPack(id);
  if (action === "approve-send-followup") await approveAndSendFollowup(id);
}

function downloadText(filename, content, type) {
  const blob = new Blob([content], { type });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob); link.download = filename; link.click();
  URL.revokeObjectURL(link.href);
}

function showApplicationPack(id) {
  const item = state.applications.find(application => String(application.id) === String(id));
  if (!item?.tailoredResume) return toast("Application pack is not available.");
  const audit = item.resumeAudit || {};
  const coverage = item.keywordCoverage || {};
  const resumeApproved = item.tailoredStatus === "approved" || item.rawStage === "approved";
  dialog.className = "pack-modal";
  dialog.innerHTML = `<div class="dialog-content pack-dialog"><div class="dialog-header"><div><span class="badge new">${item.tailoredScore || 0}% TAILORED</span><h2>${escapeHtml(item.title)}</h2><p class="job-company">${escapeHtml(item.company)} · ${escapeHtml(item.tailoredStatus || "review")}</p></div><button class="dialog-close" aria-label="Close">x</button></div>
    <div class="pack-grid"><section><h3>ATS coverage</h3><strong class="pack-score">${coverage.pct ?? "-"}%</strong><p class="job-company">Matched: ${escapeHtml((coverage.matched || []).join(", ") || "No tracked keywords")}</p><p class="job-company">Missing: ${escapeHtml((coverage.missing || []).join(", ") || "None")}</p></section><section><h3>Truth audit</h3><strong>${escapeHtml(audit.verdict || "review")}</strong><p class="job-company">${Number(audit.autoCorrected || 0)} grounded corrections applied</p><p class="job-company">${escapeHtml((audit.qualityIssues || []).join(" ") || "No quality issues detected")}</p></section></div>
    <div class="match-reasons"><h3>Tailored summary</h3><p>${escapeHtml(item.tailoredResume.summary)}</p><h3>Prioritized skills</h3><p>${escapeHtml(item.tailoredResume.skills)}</p></div>
    <div class="match-reasons"><h3>Cover letter</h3><p class="prewrap">${escapeHtml(item.coverLetter || "Not generated")}</p></div>
    <div class="dialog-actions"><button class="secondary-button" id="view-resume">View resume</button><button class="secondary-button" id="download-json">Resume JSON</button><button class="secondary-button" id="download-tex">LaTeX</button><button class="secondary-button" id="download-pdf">Download PDF</button><button class="secondary-button" id="open-application">Open application</button><button class="secondary-button" id="mark-applied">Mark applied</button>${resumeApproved ? `<span class="approval-note">Resume approved</span>` : `<button class="primary-button" id="approve-tailored">Approve resume</button>`}</div>
    <button class="text-button pack-followup" id="prepare-interview">Create interview workspace</button>
    <button class="text-button pack-followup" id="create-followup">Create recruiter follow-up</button></div>`;
  dialog.showModal();
  dialog.querySelector(".dialog-close").onclick = () => dialog.close();
  dialog.querySelector("#view-resume").onclick = () => showResumePreview(item);
  dialog.querySelector("#download-json").onclick = () => downloadText(`${item.company}-${item.title}.json`.replace(/[^a-z0-9.-]+/gi, "_"), JSON.stringify(item.tailoredResume, null, 2), "application/json");
  dialog.querySelector("#download-tex").onclick = () => downloadText(`${item.company}-${item.title}.tex`.replace(/[^a-z0-9.-]+/gi, "_"), buildAtsLatex(item.tailoredResume, item), "application/x-latex");
  dialog.querySelector("#download-pdf").onclick = () => downloadResumePdf(item);
  dialog.querySelector("#open-application").onclick = () => window.open(item.applyUrl, "_blank", "noopener,noreferrer");
  dialog.querySelector("#mark-applied").onclick = async () => {
    try { await api(`/applications/${encodeURIComponent(item.id)}/stage`, { method: "PUT", body: JSON.stringify({ stage: "applied" }) }); dialog.close(); await connectBackend(); toast("Application marked as applied."); }
    catch (error) { toast(error.message); }
  };
  if (!resumeApproved) dialog.querySelector("#approve-tailored").onclick = async () => {
    try { await api(`/tailored-resumes/${encodeURIComponent(item.tailoredResumeId)}/approve`, { method: "POST" }); dialog.close(); await connectBackend(); toast("Resume approved. Application moved to Ready to apply."); }
    catch (error) { toast(error.message); }
  };
  dialog.querySelector("#create-followup").onclick = () => showFollowupComposer(item);
  dialog.querySelector("#prepare-interview").onclick = () => createInterviewWorkspace(item);
}

function downloadResumePdf(item) {
  const resume = item.tailoredResume;
  const escapePdf = value => String(value || "").replace(/[^\x20-\x7E]/g, " ").replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  const wrap = (value, width = 101) => String(value || "").replace(/[^\x20-\x7E]/g, " ").split(/\s+/).reduce((lines, word) => {
    const last = lines.at(-1) || "";
    if (!last || `${last} ${word}`.length <= width) lines[lines.length - 1] = `${last}${last ? " " : ""}${word}`;
    else lines.push(word);
    return lines;
  }, [""]).filter(Boolean);
  const pages = [[]];
  const links = [];
  let y = 760;
  const left = 35;
  const right = 577;
  const add = (text, { size = 8.7, bold = false, x = left, align = "left", gap = 10.5 } = {}) => {
    if (y < 43) { pages.push([]); y = 760; }
    const safeText = escapePdf(text);
    const width = Math.max(0, String(text || "").length * size * (bold ? .56 : .49));
    const tx = align === "center" ? (612 - width) / 2 : align === "right" ? right - width : x;
    pages.at(-1).push(`BT /F${bold ? 2 : 1} ${size} Tf 1 0 0 1 ${Math.max(left, tx).toFixed(1)} ${y.toFixed(1)} Tm (${safeText}) Tj ET`);
    y -= gap;
  };
  const addPair = (primary, secondary, { size = 8.7, bold = false, gap = 10.5 } = {}) => {
    if (y < 43) { pages.push([]); y = 760; }
    const primaryWidth = Math.max(0, String(primary || "").length * size * (bold ? .56 : .49));
    const secondarySize = 8.4;
    const secondaryWidth = Math.max(0, String(secondary || "").length * secondarySize * .49);
    pages.at(-1).push(`BT /F${bold ? 2 : 1} ${size} Tf 1 0 0 1 ${left} ${y.toFixed(1)} Tm (${escapePdf(primary)}) Tj ET`);
    if (secondary) pages.at(-1).push(`BT /F1 ${secondarySize} Tf 1 0 0 1 ${Math.max(left + primaryWidth + 12, right - secondaryWidth).toFixed(1)} ${y.toFixed(1)} Tm (${escapePdf(secondary)}) Tj ET`);
    y -= gap;
  };
  const section = label => {
    y -= 4;
    add(label.toUpperCase(), { size: 10.2, bold: true, gap: 11 });
    pages.at(-1).push(`0.35 w ${left} ${y + 5} m ${right} ${y + 5} l S`);
    y -= 2;
  };
  const addBullets = bullets => (bullets || []).forEach(bullet => wrap(`- ${bullet}`, 97).forEach((line, index) => add(line, { x: index ? left + 10 : left + 6, gap: 10 })));
  add(resume.name || state.profile.fullName, { size: 18, bold: true, align: "center", gap: 16 });
  add(resume.title || item.title, { size: 10, bold: true, align: "center", gap: 12 });
  add([resume.phone, resume.location].filter(Boolean).join(" | "), { size: 8.5, align: "center", gap: 10 });
  const contactParts = [resume.email, resume.linkedin ? "LinkedIn" : "", resume.website ? "Portfolio Website" : ""].filter(Boolean);
  const contactText = contactParts.join(" | ");
  const contactY = y;
  const contactSize = 8.2;
  const contactWidth = contactText.length * contactSize * .49;
  const contactX = Math.max(left, (612 - contactWidth) / 2);
  add(contactText, { size: contactSize, align: "center", gap: 14 });
  let linkX = contactX;
  contactParts.forEach((part, index) => {
    const partWidth = part.length * contactSize * .49;
    const url = part === resume.email ? `mailto:${resume.email}` : part === "LinkedIn" ? resume.linkedin : resume.website;
    if (url) links.push({ page: 0, x: linkX, y: contactY - 2, width: partWidth, url });
    linkX += partWidth + (index < contactParts.length - 1 ? 3 * contactSize * .49 : 0);
  });
  section("Summary"); wrap(resume.summary).forEach(line => add(line, { gap: 10 }));
  section("Skills"); wrap(resume.skills).forEach(line => add(line, { gap: 10 }));
  section("Professional Experience");
  (resume.experienceStructured || []).forEach(entry => {
    addPair(entry.role || "", entry.dates || "", { bold: true, gap: 10 });
    add(`${entry.company || ""}${entry.location ? ` | ${entry.location}` : ""}`, { size: 8.6, gap: 10 });
    addBullets(entry.bullets); y -= 2;
  });
  if ((resume.projectsStructured || []).length) {
    section("Projects");
    (resume.projectsStructured || []).forEach(entry => { addPair(entry.name || "", entry.tech || "", { bold: true, gap: 10 }); addBullets(entry.bullets); y -= 2; });
  }
  if ((resume.educationStructured || []).length || (resume.certificationsStructured || []).length) {
    section("Education & Certifications");
    (resume.educationStructured || []).forEach(entry => { addPair(`${entry.degree || ""}${entry.school ? `, ${entry.school}` : ""}`, entry.dates || "", { bold: true, gap: 10 }); if (entry.location) add(entry.location, { size: 8.4, gap: 10 }); });
    (resume.certificationsStructured || []).forEach(entry => add(entry.name || entry, { gap: 10 }));
  }
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>"];
  const pageIds = pages.map((_, index) => 5 + index * 2);
  const annotationStart = 5 + pages.length * 2;
  const pageAnnotations = pages.map((_, index) => links.filter(link => link.page === index));
  objects[1] = `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`;
  pages.forEach((page, index) => {
    const pageId = 5 + index * 2;
    const streamId = pageId + 1;
    const stream = page.join("\n");
    const annotations = pageAnnotations[index].map((_, annotationIndex) => `${annotationStart + links.findIndex(link => link === pageAnnotations[index][annotationIndex])} 0 R`).join(" ");
    objects[pageId - 1] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${streamId} 0 R${annotations ? ` /Annots [${annotations}]` : ""} >>`;
    objects[streamId - 1] = `<< /Length ${new TextEncoder().encode(stream).length} >>\nstream\n${stream}\nendstream`;
  });
  links.forEach((link, index) => {
    objects[annotationStart + index - 1] = `<< /Type /Annot /Subtype /Link /Rect [${link.x.toFixed(1)} ${link.y.toFixed(1)} ${(link.x + link.width).toFixed(1)} ${(link.y + 10).toFixed(1)}] /Border [0 0 0] /A << /S /URI /URI (${escapePdf(link.url)}) >> >>`;
  });
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => { offsets[index + 1] = new TextEncoder().encode(pdf).length; pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = new TextEncoder().encode(pdf).length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  downloadText(`${item.company}-${item.title}.pdf`.replace(/[^a-z0-9.-]+/gi, "_"), pdf, "application/pdf");
}

function buildAtsLatex(resume, item) {
  const esc = value => String(value || "").replace(/\\/g, "\\textbackslash{}").replace(/([#$%&_{}])/g, "\\$1").replace(/~/g, "\\textasciitilde{}").replace(/\^/g, "\\textasciicircum{}");
  const lines = [
    "\\documentclass{resume}", "\\usepackage[left=0.4in,top=0.4in,right=0.4in,bottom=0.4in]{geometry}", "\\usepackage{hyperref}", "\\hypersetup{colorlinks=true,urlcolor=blue}",
    `\\name{${esc(resume.name || state.profile.fullName)}}`,
    `\\address{${esc(resume.phone || "")} \\\\ ${esc(resume.location || "Hyderabad, Telangana")}}`,
    `\\address{\\href{mailto:${esc(resume.email || "")}}{${esc(resume.email || "")}} \\\\ \\href{${esc(resume.linkedin || "")}}{LinkedIn} \\\\ \\href{${esc(resume.website || "")}}{Portfolio Website}}`,
    `\\address{${esc(resume.title || item.title)}}`, "\\begin{document}", "\\vspace{-10pt}", "\\begin{rSection}{Summary}", esc(resume.summary), "\\end{rSection}",
    "\\vspace{-8pt}", "\\begin{rSection}{Skills}", esc(resume.skills), "\\end{rSection}", "\\vspace{-8pt}", "\\begin{rSection}{Professional Experience}"
  ];
  (resume.experienceStructured || []).forEach(entry => { lines.push(`\\textbf{${esc(entry.role)}} \\hfill ${esc(entry.dates)}\\\\`, `${esc(entry.company)} \\hfill \\textit{${esc(entry.location)}}`, "\\begin{itemize}", ...(entry.bullets || []).map(bullet => `\\item ${esc(bullet)}`), "\\end{itemize}", "\\vspace{2pt}"); });
  lines.push("\\end{rSection}");
  if ((resume.projectsStructured || []).length) { lines.push("\\vspace{-8pt}", "\\begin{rSection}{Projects}"); (resume.projectsStructured || []).forEach(entry => { lines.push(`\\item \\textbf{${esc(entry.name)}} \\hfill \\textit{${esc(entry.tech)}}`, "\\begin{itemize}", ...(entry.bullets || []).map(bullet => `\\item ${esc(bullet)}`), "\\end{itemize}"); }); lines.push("\\end{rSection}"); }
  if ((resume.educationStructured || []).length || (resume.certificationsStructured || []).length) { lines.push("\\vspace{-8pt}", "\\begin{rSection}{Education \\& Certifications}"); (resume.educationStructured || []).forEach(entry => lines.push(`\\textbf{${esc(entry.degree)}}, ${esc(entry.school)} \\hfill ${esc(entry.dates)}\\\\`, `\\textit{${esc(entry.location)}}`)); (resume.certificationsStructured || []).forEach(entry => lines.push(`\\item ${esc(entry.name)}`)); lines.push("\\end{rSection}"); }
  lines.push("\\end{document}");
  return lines.join("\n");
}

function showResumePreview(item) {
  const resume = item.tailoredResume;
  const role = entry => `<section class="resume-entry"><h4>${escapeHtml(entry.role)} <small>${escapeHtml(entry.dates)}</small></h4><p>${escapeHtml(entry.company)}${entry.location ? ` <span>|</span> ${escapeHtml(entry.location)}` : ""}</p><ul>${(entry.bullets || []).map(bullet => `<li>${escapeHtml(bullet)}</li>`).join("")}</ul></section>`;
  const project = entry => `<section class="resume-entry"><h4>${escapeHtml(entry.name)} <small>${escapeHtml(entry.tech)}</small></h4><ul>${(entry.bullets || []).map(bullet => `<li>${escapeHtml(bullet)}</li>`).join("")}</ul></section>`;
  const education = entry => `<section class="resume-entry resume-education"><h4>${escapeHtml(entry.degree)}${entry.school ? `, ${escapeHtml(entry.school)}` : ""} <small>${escapeHtml(entry.dates)}</small></h4>${entry.location ? `<p>${escapeHtml(entry.location)}</p>` : ""}</section>`;
  dialog.className = "pack-modal";
  dialog.innerHTML = `<div class="dialog-content resume-preview"><div class="dialog-header preview-tools"><span class="badge new">TAILORED RESUME</span><button class="dialog-close" aria-label="Close">x</button></div><article class="resume-sheet"><header><h2>${escapeHtml(resume.name || state.profile.fullName)}</h2><strong>${escapeHtml(resume.title || item.title)}</strong><p>${escapeHtml([resume.phone, resume.location].filter(Boolean).join(" | "))}</p><p><a href="mailto:${escapeHtml(resume.email || "")}">${escapeHtml(resume.email || "")}</a>${resume.linkedin ? ` | <a href="${escapeHtml(resume.linkedin)}" target="_blank" rel="noreferrer">LinkedIn</a>` : ""}${resume.website ? ` | <a href="${escapeHtml(resume.website)}" target="_blank" rel="noreferrer">Portfolio Website</a>` : ""}</p></header><section><h3>Summary</h3><p>${escapeHtml(resume.summary)}</p></section><section><h3>Skills</h3><p>${escapeHtml(resume.skills)}</p></section><section><h3>Professional Experience</h3>${(resume.experienceStructured || []).map(role).join("") || "<p>No experience entries.</p>"}</section>${(resume.projectsStructured || []).length ? `<section><h3>Projects</h3>${(resume.projectsStructured || []).map(project).join("")}</section>` : ""}${(resume.educationStructured || []).length || (resume.certificationsStructured || []).length ? `<section><h3>Education &amp; Certifications</h3>${(resume.educationStructured || []).map(education).join("")}${(resume.certificationsStructured || []).map(entry => `<p class="resume-certification">${escapeHtml(entry.name || entry)}</p>`).join("")}</section>` : ""}</article><div class="dialog-actions"><button class="secondary-button" id="back-to-pack">Back</button><button class="primary-button" id="preview-download-pdf">Download PDF</button></div></div>`;
  dialog.querySelector(".dialog-close").onclick = () => dialog.close();
  dialog.querySelector("#back-to-pack").onclick = () => showApplicationPack(item.id);
  dialog.querySelector("#preview-download-pdf").onclick = () => downloadResumePdf(item);
}

async function createInterviewWorkspace(application) {
  try { const result = await api(`/applications/${encodeURIComponent(application.id)}/interview-prep`, { method: "POST" }); const prep = result.prep; dialog.innerHTML = `<div class="dialog-content"><div class="dialog-header"><div><span class="badge new">INTERVIEW PREP</span><h2>${escapeHtml(application.title)}</h2><p class="job-company">${escapeHtml(application.company)}</p></div><button class="dialog-close" aria-label="Close">x</button></div><h3>Company brief</h3><p>${escapeHtml(prep.companyBrief)}</p><h3>Practice questions</h3><ol>${prep.questions.map(question => `<li>${escapeHtml(question)}</li>`).join("")}</ol><h3>Focus skills</h3><p>${escapeHtml(prep.focusSkills.join(", ") || "Role requirements")}</p></div>`; dialog.querySelector(".dialog-close").onclick = () => dialog.close(); } catch (error) { toast(error.message); }
}

async function saveAnswerLibrary() {
  const fields = [{ key: "notice_period", label: "Notice period" }, { key: "expected_ctc", label: "Expected CTC" }, { key: "work_authorization", label: "Work authorization" }, { key: "linkedin", label: "LinkedIn URL" }, { key: "portfolio", label: "Portfolio URL" }];
  try { await api("/application-answers", { method: "PUT", body: JSON.stringify({ answers: fields.map(field => ({ ...field, value: document.querySelector(`#answer-${field.key}`).value.trim(), verified: true })) }) }); await connectBackend(); toast("Answer library saved."); } catch (error) { toast(error.message); }
}

function showFollowupComposer(application) {
  const defaultSubject = `Following up on my ${application.title} application`;
  const defaultBody = `Hello,\n\nI recently applied for the ${application.title} role at ${application.company}. I am following up to reiterate my interest and ask whether there is any additional information I can provide.\n\nThank you for your time,\n${state.profile.fullName}`;
  dialog.innerHTML = `<form class="dialog-content" id="followup-form"><div class="dialog-header"><div><span class="badge new">FOLLOW-UP</span><h2>${escapeHtml(application.title)}</h2><p class="job-company">${escapeHtml(application.company)}</p></div><button type="button" class="dialog-close" aria-label="Close">x</button></div>
    <div class="field"><label for="recruiter-name">Recruiter name</label><input id="recruiter-name" placeholder="Optional"></div>
    <div class="field"><label for="recruiter-email">Recruiter email</label><input id="recruiter-email" type="email" required list="verified-contacts" placeholder="name@company.com"><datalist id="verified-contacts">${(state.contacts || []).map(contact => `<option value="${escapeHtml(contact.email)}">${escapeHtml(contact.name || "Verified contact")}</option>`).join("")}</datalist></div>
    <label class="check-row"><input id="verified-contact" type="checkbox"> I verified this recruiter contact myself</label>
    <div class="field"><label for="followup-subject">Subject</label><input id="followup-subject" required value="${escapeHtml(defaultSubject)}"></div>
    <div class="field"><label for="followup-body">Message</label><textarea id="followup-body" required rows="8">${escapeHtml(defaultBody)}</textarea></div>
    <div class="dialog-actions"><button type="button" class="secondary-button dialog-close-secondary">Cancel</button><button class="primary-button" type="submit">Save follow-up draft</button></div></form>`;
  dialog.querySelector(".dialog-close").onclick = () => dialog.close();
  dialog.querySelector(".dialog-close-secondary").onclick = () => dialog.close();
  dialog.querySelector("#followup-form").onsubmit = async event => {
    event.preventDefault();
    try {
      await api("/outreach", { method: "POST", body: JSON.stringify({ applicationId: application.id, recruiterName: dialog.querySelector("#recruiter-name").value, recruiterEmail: dialog.querySelector("#recruiter-email").value, subject: dialog.querySelector("#followup-subject").value, body: dialog.querySelector("#followup-body").value, verifiedContact: dialog.querySelector("#verified-contact").checked }) });
      dialog.close(); await connectBackend(); state.activeView = "outreach"; render(); toast("Follow-up draft saved. Approve and send when ready.");
    } catch (error) { toast(error.message); }
  };
}

async function approveAndSendFollowup(id) {
  const item = state.outreach.find(row => String(row.id) === String(id));
  if (!item?.email) return toast("Add a recruiter email before sending.");
  try {
    await api(`/outreach/${encodeURIComponent(id)}/approve-send`, { method: "POST" });
    await connectBackend();
    toast(`Follow-up sent to ${item.email}.`);
  } catch (error) { toast(error.message); }
}

async function exportData() {
  if (!remoteEnabled) return toast("Connect the cloud backend first.");
  try {
    const data = await api("/data/export");
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `applypilot-export-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  } catch (error) { toast(error.message); }
}

async function approveJob(id) {
  const job = state.jobs.find(item => String(item.id) === String(id));
  if (!job) return;
  const approvalKey = String(id);
  if (pendingApprovals.has(approvalKey)) return toast("This application pack is already being prepared.", { title: "Preparation in progress" });
  pendingApprovals.add(approvalKey);
  operationOverlay.querySelector("#operation-title").textContent = `Preparing ${job.company} application`;
  operationOverlay.querySelector("#operation-detail").textContent = "Checking the JD, tailoring your verified resume and saving the application history.";
  operationOverlay.hidden = false;
  if (remoteEnabled) {
    try {
      await api(`/jobs/${encodeURIComponent(id)}/decision`, { method: "POST", body: JSON.stringify({ decision: "approved" }) });
      await connectBackend();
      return toast(`${job.company} approved. A truthful application draft was prepared.`);
    } catch (error) {
      if (/unique constraint|tailored_resumes\.job_id/i.test(error.message)) {
        await connectBackend();
        return toast("The application pack was already created and is available in Pipeline.", { title: "Application ready" });
      }
      return toast(error.message, { title: "Preparation failed", tone: "error" });
    } finally {
      pendingApprovals.delete(approvalKey);
      operationOverlay.hidden = true;
    }
  }
  job.status = "approved";
  state.applications.unshift({ id: Date.now(), title: job.title, company: job.company, stage: "applied", updated: "Just now", score: job.score });
  state.activity.unshift({ text: `Application pack prepared for ${job.company}`, time: "Just now" });
  pendingApprovals.delete(approvalKey);
  operationOverlay.hidden = true;
  saveState(); render(); toast(`${job.company} approved. Application pack is ready.`);
}

async function updateJob(id, status, message) {
  const job = state.jobs.find(item => String(item.id) === String(id));
  if (remoteEnabled) {
    try {
      await api(`/jobs/${encodeURIComponent(id)}/decision`, { method: "POST", body: JSON.stringify({ decision: status === "skipped" ? "skipped" : status }) });
      await connectBackend();
      return toast(message);
    } catch (error) { return toast(error.message); }
  }
  if (job) job.status = status;
  saveState(); render(); toast(message);
}

function toggleInternSummary(id) {
  const summary = document.querySelector(`#intern-summary-${CSS.escape(String(id))}`);
  if (summary) summary.hidden = !summary.hidden;
}

function showAllAlerts() {
  dialog.innerHTML = `<div class="dialog-content alert-dialog"><div class="dialog-header"><div><span class="badge new">${state.leads.length} ALERTS</span><h2>All portal alerts</h2><p class="job-company">These are official links, not confirmed matches. Review a JD before approving.</p></div><button class="dialog-close" aria-label="Close">x</button></div><div class="alert-list">${state.leads.map(lead => `<article><div><span class="lead-provider">${escapeHtml(lead.provider)}</span><h3>${escapeHtml(lead.subject || "Job posting")}</h3></div><button class="secondary-button" data-alert-id="${escapeHtml(lead.id)}" data-alert-url="${escapeHtml(lead.url)}">Open</button></article>`).join("")}</div></div>`;
  dialog.showModal();
  dialog.querySelector(".dialog-close").onclick = () => dialog.close();
  dialog.querySelectorAll("[data-alert-id]").forEach(button => button.onclick = () => openLead(button.dataset.alertId, button.dataset.alertUrl));
}

function showJob(id) {
  const job = state.jobs.find(item => String(item.id) === String(id));
  dialog.innerHTML = `<div class="dialog-content"><div class="dialog-header"><div><span class="badge new">${job.score}% MATCH</span><h2>${job.title}</h2><p class="job-company">${job.company} · ${job.location}</p></div><button class="dialog-close" aria-label="Close">×</button></div>
    <div class="match-reasons"><h3>Why this matches</h3><ul>${job.reasons.map(reason => `<li>${escapeHtml(reason)}</li>`).join("")}</ul></div>
    <div class="pack-grid"><section><h3>Job quality</h3><p class="job-company">${escapeHtml(job.score >= 75 ? "Strong role and skill alignment" : job.score >= 50 ? "Partial or transferable alignment" : "Broad early-career option")}</p><p class="job-company">Source: ${escapeHtml(job.source)} official board</p></section><section><h3>Before preparing</h3><p class="job-company">${escapeHtml(job.description ? "Full JD is available for resume tailoring." : "A full JD is required before a resume can be prepared.")}</p><p class="job-company">${escapeHtml(job.riskFlags?.join(" ") || "No source risk flags detected.")}</p></section></div>
    <div class="match-reasons"><h3>Role summary</h3><p>${escapeHtml(String(job.description || "No description available.").replace(/\s+/g, " ").slice(0, 700))}</p></div>
    <div class="dialog-actions"><button class="secondary-button dialog-close-secondary">Close</button><button class="primary-button" id="dialog-approve">Approve application</button></div></div>`;
  dialog.showModal();
  dialog.querySelector(".dialog-close").onclick = () => dialog.close();
  dialog.querySelector(".dialog-close-secondary").onclick = () => dialog.close();
  dialog.querySelector("#dialog-approve").onclick = () => { dialog.close(); approveJob(id); };
}

function reviewOutreach(id) {
  const item = state.outreach.find(row => String(row.id) === String(id));
  if (!item) return;
  dialog.innerHTML = `<div class="dialog-content"><div class="dialog-header"><div><span class="badge">${escapeHtml(item.status)}</span><h2>${escapeHtml(item.role)}</h2><p class="job-company">${escapeHtml(item.name)} · ${escapeHtml(item.email || item.company)}</p></div><button class="dialog-close" aria-label="Close">x</button></div><div class="match-reasons"><h3>${escapeHtml(item.subject)}</h3><p class="prewrap">${escapeHtml(item.body)}</p></div><div class="dialog-actions"><button class="secondary-button dialog-close-secondary">Close</button></div></div>`;
  dialog.showModal();
  dialog.querySelector(".dialog-close").onclick = () => dialog.close();
  dialog.querySelector(".dialog-close-secondary").onclick = () => dialog.close();
}

async function runScan() {
  if (state.settings.searchPaused) return toast("Resume scans when you are ready. Manual scanning is disabled while paused.", { title: "Scans paused" });
  const button = [...document.querySelectorAll("[data-action='scan']"), document.querySelector("#demo-action")].find(item => item && !item.disabled);
  if (button) { button.disabled = true; button.classList.add("is-loading"); button.dataset.label = button.textContent; button.textContent = "Scanning official boards..."; }
  if (remoteEnabled) {
    try {
      const result = await api("/scan", { method: "POST" });
      await connectBackend();
      if (result.paused) return toast("Scheduled scanning is paused.", { title: "Scans paused" });
      const skipped = result.skipped || {};
      const exclusions = [
        ["too old", skipped.stale], ["location", skipped.location], ["experience", skipped.experience],
        ["salary", skipped.salary], ["low fit", skipped.lowFit]
      ].filter(([, count]) => count).map(([label, count]) => `${count} ${label}`).join(", ");
      return toast(`${result.considered || 0} official postings checked. ${result.discovered || 0} new role${result.discovered === 1 ? "" : "s"}; ${result.alreadyTracked || 0} already tracked.${exclusions ? ` Excluded by your rules: ${exclusions}.` : ""}`, { title: result.discovered ? "New opportunities found" : "Scan complete", duration: 4200 });
    } catch (error) { return toast(error.message, { title: "Scan failed", tone: "error" }); }
    finally { if (button) { button.disabled = false; button.classList.remove("is-loading"); button.textContent = button.dataset.label || "Run job scan"; } }
  }
  state.scannedAt = new Date().toISOString();
  state.activity.unshift({ text: "Job scan completed across 3 demo sources", time: "Just now" });
  saveState(); render(); toast("Scan complete. No duplicate roles were added.");
}

async function addSource() {
  if (!remoteEnabled) return toast("Connect the cloud backend before adding live sources.");
  const provider = document.querySelector("#source-provider").value;
  const organization = document.querySelector("#source-org").value.trim();
  const label = document.querySelector("#source-label").value.trim();
  if (!organization || !label) return toast("Board identifier and company label are required.");
  try {
    await api("/sources", { method: "POST", body: JSON.stringify({ provider, organization, label }) });
    await connectBackend();
    toast(`${label} source added.`);
  } catch (error) { toast(error.message); }
}

async function addPreset(organization) {
  const source = SOURCE_PRESETS.find(item => item.organization === organization);
  if (!source) return;
  try { await api("/sources", { method: "POST", body: JSON.stringify(source) }); await connectBackend(); toast(`${source.label} is now monitored.`); }
  catch (error) { toast(error.message); }
}

async function deleteSource(id) {
  if (!remoteEnabled) return;
  try {
    await api(`/sources/${id}`, { method: "DELETE" });
    await connectBackend();
    toast("Source removed.");
  } catch (error) { toast(error.message); }
}

async function openLead(id, url) {
  const lead = state.leads.find(item => String(item.id) === String(id));
  if (!lead) return window.open(url, "_blank", "noopener,noreferrer");
  showLeadImport(lead);
}

function showLeadImport(lead) {
  const genericTitle = /^(linkedin|naukri|indeed) job posting$/i.test(String(lead.subject || ""));
  dialog.innerHTML = `<form class="dialog-content lead-import-dialog" id="lead-import-form"><div class="dialog-header"><div><span class="lead-provider">${escapeHtml(lead.provider)}</span><h2>Import and score job</h2><p class="job-company">Open the official posting, copy its visible JD, then score it here.</p></div><button type="button" class="dialog-close" aria-label="Close">x</button></div><div class="field"><label for="lead-title">Job title</label><input id="lead-title" required value="${genericTitle ? "" : escapeHtml(lead.subject)}" placeholder="Data Analyst Intern"></div><div class="field"><label for="lead-company">Company</label><input id="lead-company" required placeholder="Company name"></div><div class="field"><label for="lead-location">Location and work mode</label><input id="lead-location" placeholder="Hyderabad, Remote India, Hybrid"></div><div class="field"><label for="lead-salary">Pay or stipend, if listed</label><input id="lead-salary" placeholder="Example: INR 20,000 per month"></div><div class="field"><label for="lead-description">Complete job description</label><textarea id="lead-description" required rows="9" placeholder="Paste the visible official job description"></textarea></div><div class="dialog-actions"><button type="button" class="secondary-button" id="open-official-lead">Open official posting</button><button class="primary-button" type="submit">Score this job</button></div></form>`;
  dialog.showModal();
  dialog.querySelector(".dialog-close").onclick = () => dialog.close();
  dialog.querySelector("#open-official-lead").onclick = () => window.open(lead.url, "_blank", "noopener,noreferrer");
  dialog.querySelector("#lead-import-form").onsubmit = async event => {
    event.preventDefault();
    try {
      const result = await api(`/leads/${encodeURIComponent(lead.id)}`, { method: "POST", body: JSON.stringify({ title: dialog.querySelector("#lead-title").value, company: dialog.querySelector("#lead-company").value, location: dialog.querySelector("#lead-location").value, workplaceType: dialog.querySelector("#lead-location").value, salaryText: dialog.querySelector("#lead-salary").value, description: dialog.querySelector("#lead-description").value }) });
      dialog.close(); await connectBackend(); state.activeView = "today"; render(); toast(result.score >= state.settings.minimumMatchScore ? `${result.score}% match. Review it in your scored jobs queue.` : `${result.score}% match. Saved for reference, below your review threshold.`);
    } catch (error) { toast(error.message); }
  };
}

function showManualInternshipImport() {
  dialog.innerHTML = `<form class="dialog-content lead-import-dialog" id="internship-import-form"><div class="dialog-header"><div><span class="lead-provider">OFFICIAL POSTING</span><h2>Import internship JD</h2><p class="job-company">Copy the public job description from the company's official career page, then score and prepare it here.</p></div><button type="button" class="dialog-close" aria-label="Close">x</button></div><div class="field"><label for="intern-title">Internship title</label><input id="intern-title" required placeholder="Data Analyst Intern"></div><div class="field"><label for="intern-company">Company</label><input id="intern-company" required placeholder="Company name"></div><div class="field"><label for="intern-url">Official application URL</label><input id="intern-url" type="url" required placeholder="https://careers.company.com/jobs/..."> </div><div class="field"><label for="intern-location">Location and work mode</label><input id="intern-location" placeholder="Hyderabad, Remote India, Hybrid"></div><div class="field"><label for="intern-pay">Pay or stipend, if listed</label><input id="intern-pay" placeholder="Example: INR 20,000 per month"></div><div class="field"><label for="intern-description">Complete job description</label><textarea id="intern-description" required rows="9" placeholder="Paste the visible official job description"></textarea></div><div class="dialog-actions"><button class="primary-button" type="submit">Score internship</button></div></form>`;
  dialog.showModal();
  dialog.querySelector(".dialog-close").onclick = () => dialog.close();
  dialog.querySelector("#internship-import-form").onsubmit = async event => {
    event.preventDefault();
    try {
      const result = await api("/jobs/manual", { method: "POST", body: JSON.stringify({
        title: dialog.querySelector("#intern-title").value,
        company: dialog.querySelector("#intern-company").value,
        applyUrl: dialog.querySelector("#intern-url").value,
        location: dialog.querySelector("#intern-location").value,
        workplaceType: dialog.querySelector("#intern-location").value,
        salaryText: dialog.querySelector("#intern-pay").value,
        description: dialog.querySelector("#intern-description").value,
        opportunityType: "internship"
      }) });
      dialog.close();
      await connectBackend();
      state.activeView = "internships";
      render();
      toast(`${result.score}% fit. Review it, then prepare the application when ready.`);
    } catch (error) { toast(error.message); }
  };
}

function resetDemo() {
  const view = state.activeView;
  state = structuredClone(seedState);
  state.activeView = view;
  saveState(); render(); toast("Demo data restored.");
}

function toast(message, { title = "ApplyPilot", duration = 4000, tone = "info" } = {}) {
  const node = document.createElement("div");
  node.className = `toast toast-${tone}`;
  node.innerHTML = `<span class="toast-indicator" aria-hidden="true"></span><div><strong>${escapeHtml(title)}</strong><p>${escapeHtml(message)}</p></div>`;
  document.querySelector("#toast-region").append(node);
  setTimeout(() => { node.classList.add("toast-leave"); setTimeout(() => node.remove(), 180); }, duration);
}

document.addEventListener("click", event => {
  const nav = event.target.closest("[data-view]");
  if (!nav) return;
  state.activeView = nav.dataset.view;
  saveState(); render();
  window.scrollTo({ top: 0, behavior: "smooth" });
});

document.querySelector("#demo-action").addEventListener("click", async () => {
  if (state.activeView === "today") return runScan();
  if (state.activeView === "internships") return runScan();
  if (state.activeView === "settings") {
    state.settings.role = document.querySelector("#role").value.trim() || seedState.settings.role;
    state.settings.alternateTitles = document.querySelector("#alternate-titles").value.trim();
    state.settings.internshipTitles = document.querySelector("#internship-titles").value.trim();
    state.settings.location = document.querySelector("#location").value.trim() || seedState.settings.location;
    state.settings.dailyLimit = Number(document.querySelector("#limit").value) || 8;
    state.settings.minimumSalary = (Number(document.querySelector("#minimum-salary").value) || 7) * 100000;
    state.settings.requiredSkills = document.querySelector("#skills").value.trim();
    state.settings.activeFrom = document.querySelector("#active-from").value;
    state.settings.freshnessHours = Number(document.querySelector("#freshness").value) || 168;
    state.settings.experienceToleranceYears = Number(document.querySelector("#experience-tolerance").value) || 0;
    state.settings.minimumMatchScore = Number(document.querySelector("#match-score").value) || 65;
    state.settings.tailoringMinimumScore = Number(document.querySelector("#tailoring-score").value) || 75;
    state.settings.mustHaveSkills = document.querySelector("#must-have-skills").value.trim();
    if (state.settings.browserNotifications && "Notification" in window && Notification.permission === "default") await Notification.requestPermission();
    if (remoteEnabled) {
      try {
        await api("/settings", { method: "PUT", body: JSON.stringify({
          target_role: state.settings.role,
          preferred_locations: state.settings.location,
          required_skills: state.settings.requiredSkills,
          minimum_salary: state.settings.minimumSalary,
          daily_application_limit: state.settings.dailyLimit,
          require_approval: state.settings.approval,
          followups_enabled: state.settings.followups,
          alternate_titles: state.settings.alternateTitles || "",
          excluded_keywords: state.settings.excludedKeywords || "",
          followup_days: state.settings.followupDays || 5
          ,active_from: state.settings.activeFrom || null
          ,freshness_hours: state.settings.freshnessHours
          ,minimum_match_score: state.settings.minimumMatchScore
          ,browser_notifications: state.settings.browserNotifications
          ,tailoring_minimum_score: state.settings.tailoringMinimumScore
          ,must_have_skills: state.settings.mustHaveSkills
          ,internship_titles: state.settings.internshipTitles
          ,experience_tolerance_years: state.settings.experienceToleranceYears
          ,search_paused: state.settings.searchPaused
        }) });
      } catch (error) { return toast(error.message); }
    }
    saveState(); toast(remoteEnabled ? "Preferences saved to the cloud." : "Preferences saved on this device.");
    return;
  }
  toast("This action will connect to the hosted backend in the next phase.");
});

document.querySelector("#notifications-button").addEventListener("click", () => {
  const pending = state.jobs.filter(job => job.status === "new").length;
  const alerts = state.leads.length;
  const replies = state.outreach.filter(item => item.status === "sent").length;
  toast(pending || replies || alerts ? `${pending} scored jobs are in your queues. ${alerts} portal alerts are unscored links, not job matches. ${replies} recruiter threads are active.` : "No new notifications.", { title: "Search status", duration: 4400 });
});
document.querySelector("#scan-toggle").addEventListener("click", async () => {
  state.settings.searchPaused = !state.settings.searchPaused;
  if (remoteEnabled) {
    try {
      await api("/settings", { method: "PUT", body: JSON.stringify({
        target_role: state.settings.role, alternate_titles: state.settings.alternateTitles || "", preferred_locations: state.settings.location,
        required_skills: state.settings.requiredSkills, excluded_keywords: state.settings.excludedKeywords || "", minimum_salary: state.settings.minimumSalary,
        daily_application_limit: state.settings.dailyLimit, require_approval: state.settings.approval, followups_enabled: state.settings.followups,
        followup_days: state.settings.followupDays || 5, active_from: state.settings.activeFrom || null, freshness_hours: state.settings.freshnessHours || 168,
        minimum_match_score: state.settings.minimumMatchScore || 50, browser_notifications: state.settings.browserNotifications,
        tailoring_minimum_score: state.settings.tailoringMinimumScore || 50, must_have_skills: state.settings.mustHaveSkills || "", internship_titles: state.settings.internshipTitles || "",
        experience_tolerance_years: state.settings.experienceToleranceYears ?? 2, search_paused: state.settings.searchPaused
      }) });
    } catch (error) { state.settings.searchPaused = !state.settings.searchPaused; return toast(error.message, { title: "Could not update scans", tone: "error" }); }
  }
  saveState(); render(); toast(state.settings.searchPaused ? "Automatic and manual job scans are paused." : "Job scanning resumed.", { title: state.settings.searchPaused ? "Scans paused" : "Scans resumed" });
});
document.querySelector("#date-label").textContent = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "short", day: "numeric" }).format(new Date());

if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js"));
render();
connectBackend();
