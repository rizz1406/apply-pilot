const STORAGE_KEY = "applypilot-state-v2";
const API_TOKEN_KEY = "applypilot-api-token";
const API_TOKEN_EXPIRY_KEY = "applypilot-api-token-expiry";
const API_BASE = location.port === "4173" ? "http://127.0.0.1:8787/api" : "https://applypilot-api.rizwanmirza95551.workers.dev/api";
let remoteEnabled = false;

function getApiToken() {
  const token = localStorage.getItem(API_TOKEN_KEY);
  const expiry = localStorage.getItem(API_TOKEN_EXPIRY_KEY);
  if (!token) return null;
  if (expiry && Date.now() > Number(expiry)) {
    localStorage.removeItem(API_TOKEN_KEY);
    localStorage.removeItem(API_TOKEN_EXPIRY_KEY);
    return null;
  }
  try { return atob(token); } catch { return token; }
}
function setApiToken(value, ttlDays = 30) {
  if (!value) {
    localStorage.removeItem(API_TOKEN_KEY);
    localStorage.removeItem(API_TOKEN_EXPIRY_KEY);
    return;
  }
  localStorage.setItem(API_TOKEN_KEY, btoa(value.trim()));
  localStorage.setItem(API_TOKEN_EXPIRY_KEY, String(Date.now() + ttlDays * 86400000));
}
function isTokenExpiringSoon(days = 3) {
  const expiry = Number(localStorage.getItem(API_TOKEN_EXPIRY_KEY) || 0);
  if (!expiry) return false;
  return expiry - Date.now() < days * 86400000;
}
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
  activeView: "inbox",
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
    telegram: false,
    aiDailyBudget: 12,
    compactView: false,
    reduceMotion: false,
    fontScale: "medium",
    savedFilter: "matches"
  },
  jobs: [],
  applications: [],
  outreach: [],
  activity: [],
  leads: [],
  sources: [],
  jobsVisible: 20
};

const navItems = [
  { id: "inbox", label: "Inbox", glyph: "A" },
  { id: "internships", label: "Early career", glyph: "I" },
  { id: "freelance", label: "Freelance", glyph: "F" },
  { id: "today", label: "Review", glyph: "R" },
  { id: "pipeline", label: "Pipeline", glyph: "P" },
  { id: "outreach", label: "Outreach", glyph: "O" },
  { id: "interviews", label: "Interviews", glyph: "Q" },
  { id: "health", label: "Health", glyph: "H" },
  { id: "settings", label: "Settings", glyph: "S" }
];

let state = loadState();
const app = document.querySelector("#app");
const dialog = document.querySelector("#detail-dialog");
const operationOverlay = document.querySelector("#operation-overlay");
const pendingApprovals = new Set();
dialog.addEventListener("close", () => { dialog.className = ""; });

async function api(path, options = {}) {
  const token = getApiToken();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      signal: controller.signal,
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401 && token) {
        toast("Session expired. Please re-enter your API token in Settings.", { title: "Authentication", tone: "error", duration: 5000 });
      }
      if (response.status === 429) {
        throw new Error(data.error || "Too many requests. Wait a moment and retry.");
      }
      throw new Error(data.error || `Request failed with ${response.status}`);
    }
    return data;
  } catch (error) {
    if (error.name === "AbortError") throw new Error("Request timed out. Check your connection.");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function parseJson(value, fallback) {
  try { return JSON.parse(value); } catch { return fallback; }
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function friendlyActivity(item) {
  const t = String(item.text || item.message || "");
  const time = item.time || item.created_at || "";
  let friendly = t;
  if (/Job scan completed/i.test(t)) {
    const m = t.match(/(\d+) new matches/i);
    friendly = m ? `Found ${m[1]} new matching jobs • auto-scored for you` : "Checked all company boards";
  } else if (/0 approved follow-ups are due/i.test(t)) friendly = "Checked follow-ups — none needed";
  else if (/Job-specific resume approved/i.test(t)) friendly = "You approved a tailored resume";
  else if (/Resume v\d+ regenerated/i.test(t)) friendly = t.replace("Resume v", "Updated resume v").replace("with @cf/meta", "using AI");
  else if (/AI resume packs created/i.test(t)) friendly = "AI resume usage updated";
  let ago = time;
  try {
    const d = new Date(time);
    if (!isNaN(d)) {
      const s = Math.floor((Date.now() - d.getTime())/1000);
      if (s < 60) ago = "just now";
      else if (s < 3600) ago = Math.floor(s/60) + "m ago";
      else if (s < 86400) ago = Math.floor(s/3600) + "h ago";
      else ago = Math.floor(s/86400) + "d ago";
    }
  } catch {}
  const icon = /Found|new matching/i.test(friendly) ? "✦" : /follow-ups/i.test(friendly) ? "✓" : /resume/i.test(friendly) ? "📄" : "•";
  return { friendly, ago, icon };
}

function mapRemote(data) {
  const colors = ["#2457d6", "#6d4ec7", "#0f766e", "#b45309", "#166534"];
  state.jobs = data.jobs.map((job, index) => ({
    id: job.id, title: job.title, company: job.company,
    initials: job.company.split(/\s+/).map(part => part[0]).join("").slice(0, 2).toUpperCase(),
    color: colors[index % colors.length], location: job.location || "Location not listed",
    mode: job.workplace_type || "Review", salary: job.salary_text || "Salary not listed",
    source: job.provider, score: job.score, age: job.discovered_at, status: job.status, opportunityType: job.opportunity_type || "full_time",
    reasons: parseJson(job.score_reasons, []), riskFlags: parseJson(job.risk_flags, []), applyUrl: job.apply_url, description: job.description,
    automationDecision: job.automation_decision || "unclassified", automationReasons: parseJson(job.automation_reasons, []), automationCapability: parseJson(job.automation_capability, {})
  }));
  const stageMap = { approved: "approved", prepared: "prepared", applied: "applied", outreach: "outreach", interview: "interview", offer: "interview", rejected: "closed", withdrawn: "closed" };
  state.applications = data.applications.map(item => ({ id: item.id, jobId: item.job_id, title: item.title, company: item.company, stage: stageMap[item.stage] || "prepared", updated: item.updated_at, submittedAt: item.submitted_at, score: item.score, applyUrl: item.apply_url, rawStage: item.stage, opportunityType: item.opportunity_type || "full_time",
    submissionStatus: item.submission_status || "not_started", confirmationSource: item.confirmation_source, confirmationConfidence: item.confirmation_confidence,
    tailoredResumeId: item.tailored_resume_id, tailoredResume: parseJson(item.tailored_resume_json, null), resumeAudit: parseJson(item.resume_audit_json, null), keywordCoverage: parseJson(item.keyword_coverage, null), tailoredScore: item.tailored_match_score, latex: item.latex_content, tailoredStatus: item.tailored_status, tailoredModel: item.tailored_model, coverLetter: item.cover_letter }));
  state.outreach = data.outreach.map(item => ({
    id: item.id, applicationId: item.application_id, name: item.recruiter_name || "Recruiter not assigned", email: item.recruiter_email || "",
    company: item.company, role: item.role, subject: item.subject, body: item.body, status: item.status,
    label: ["draft", "approved"].includes(item.status) && item.scheduled_for && new Date(item.scheduled_for) <= new Date() ? "due" : item.status, timing: item.sent_at || item.scheduled_for || item.updated_at || "Not scheduled"
  }));
  state.activity = data.activity.map(item => ({ text: item.message, time: item.created_at }));
  state.sources = data.sources || [];
  state.leads = data.leads || [];
  state.resumeVariants = data.resumeVariants || [];
  state.analytics = data.analytics || {};
  state.contacts = data.contacts || [];
  state.answers = data.answers || [];
  state.interviews = data.interviews || [];
  state.evidence = (data.evidence || []).map(item => ({ ...item, details: parseJson(item.details_json, {}) }));
  state.resumeVersions = (data.resumeVersions || []).map(item => ({ ...item, changeSummary: parseJson(item.change_summary, {}) }));
  state.checklist = data.checklist || [];
  state.sourceHealth = data.sourceHealth || [];
  state.taskRuns = data.taskRuns || [];
  state.notifications = data.notifications || [];
  state.evaluation = data.evaluation || null;
  state.documentVersions = data.documentVersions || [];
  state.feedback = data.feedback || [];
  state.applicationEvents = data.applicationEvents || [];
  state.queuedTasks = data.queuedTasks || [];
  state.aiUsage = data.aiUsage || [];
  state.projectSelections = data.projectSelections || [];
  state.authMode = data.authMode || "token";
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
      ,freelanceTitles: data.settings.freelance_titles || "Freelance Data Analyst,Contract Analyst,Hourly Consultant,Gig Data Analyst"
      ,experienceToleranceYears: data.settings.experience_tolerance_years ?? 2
      ,searchPaused: Boolean(data.settings.search_paused)
      ,aiDailyBudget: data.settings.ai_daily_budget || 4
      ,feedbackLearning: Boolean(data.settings.feedback_learning_enabled)
      ,automationMode: data.settings.automation_mode || "approval"
      ,autoApplyMinScore: data.settings.auto_apply_min_score || 88
      ,approvalMinScore: data.settings.approval_min_score || 65
      ,autoApplyDailyLimit: data.settings.auto_apply_daily_limit || 3
      ,trustedCompanies: data.settings.trusted_companies || ""
      ,blockedCompanies: data.settings.blocked_companies || ""
    };
  }
}

async function connectBackend(quiet = true) {
  try {
    if (!state.jobs.length) showSkeleton(4);
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
    inbox: state.jobs.filter(isReviewMatch).length + state.outreach.filter(item => ["draft", "approved"].includes(item.status)).length,
    today: state.jobs.filter(isReviewMatch).length,
    internships: state.jobs.filter(job => job.status === "new" && job.opportunityType === "internship").length,
    freelance: state.jobs.filter(job => job.status === "new" && job.opportunityType === "freelance").length,
    pipeline: state.applications.filter(item => item.stage !== "closed").length,
    outreach: state.outreach.filter(item => item.status !== "sent").length,
    interviews: state.interviews?.length || 0,
    health: (state.sources || []).filter(source => source.last_error).length,
    settings: ""
  };
}

function isReviewMatch(job) {
  const minimumScore = Number(state.settings.minimumMatchScore || 50);
  return job.status === "new" && !["internship", "freelance"].includes(job.opportunityType) && Number(job.score || 0) >= minimumScore;
}

function renderNav(activeView) {
  const totals = counts();
  const button = item => `
    <button class="nav-button ${activeView === item.id ? "active" : ""}" data-view="${item.id}">
      <span class="nav-glyph" aria-hidden="true">${item.glyph}</span>
      <span>${item.label}</span>
      <span class="nav-count">${totals[item.id]}</span>
    </button>`;
  document.querySelector(".desktop-nav").innerHTML = navItems.map(button).join("");
  const mobileIds = new Set(["inbox", "today", "internships", "freelance", "pipeline", "outreach", "settings"]);
  document.querySelector(".mobile-nav").innerHTML = navItems.filter(item => mobileIds.has(item.id)).map(button).join("");
}

function showSkeleton(count = 3) {
  app.innerHTML = `<div class="job-list">${Array.from({ length: count }).map(() => `<div class="skeleton-card"><div class="skeleton skeleton-line" style="width:42%"></div><div class="skeleton skeleton-line" style="width:78%"></div><div class="skeleton skeleton-line" style="width:62%"></div></div>`).join("")}</div>`;
}
function render() {
  const titles = { inbox: "Opportunity inbox", today: "Review jobs", internships: "Early Career & Internships", freelance: "Freelance & Contracts", pipeline: "Application pipeline", outreach: "Recruiter outreach", interviews: "Interview cockpit", health: "System health", settings: "Preferences" };
  const activeView = titles[state.activeView] ? state.activeView : "inbox";
  if (app && app.style) {
    app.style.opacity = "0.96";
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => { if (app && app.style) { app.style.transition = "opacity .18s var(--ease-out)"; app.style.opacity = "1"; } });
    } else if (app.style) {
      app.style.opacity = "1";
    }
  }
  if (document.documentElement?.style) document.documentElement.style.fontSize = state.settings.fontScale === "large" ? "17px" : state.settings.fontScale === "small" ? "14px" : "15.5px";
  if (document.body?.classList) {
    document.body.classList.toggle("compact", !!state.settings.compactView);
    document.body.classList.toggle("reduce-motion", !!state.settings.reduceMotion);
  }
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
  action.textContent = ["inbox", "today", "internships", "freelance"].includes(activeView) ? "Run job scan" : activeView === "settings" ? "Save changes" : activeView === "health" ? "Run checks" : "Add item";
  renderNav(activeView);
  const viewRenderers = {
    inbox: renderInbox,
    today: renderToday,
    internships: renderInternships,
    freelance: renderFreelance,
    pipeline: renderPipeline,
    outreach: renderOutreach,
    interviews: renderInterviews,
    health: renderHealth,
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

function renderInbox() {
  const matches = state.jobs.filter(isReviewMatch);
  const strong = matches.filter(job => Number(job.score) >= 75);
  const due = state.outreach.filter(item => ["draft", "approved"].includes(item.status));
  const replies = state.outreach.filter(item => item.status === "replied");
  const unconfirmed = state.applications.filter(item => item.submissionStatus === "submitted_unconfirmed");
  const upcoming = state.applications.filter(item => ["interview", "offer"].includes(item.rawStage));
  const actions = [
    strong.length && { title: `${strong.length} strong match${strong.length === 1 ? "" : "es"}`, detail: "Fresh roles ready for JD review", view: "today", tone: "match" },
    due.length && { title: `${due.length} follow-up${due.length === 1 ? "" : "s"} awaiting approval`, detail: "Nothing is sent without your approval", view: "outreach", tone: "followup" },
    replies.length && { title: `${replies.length} recruiter repl${replies.length === 1 ? "y" : "ies"}`, detail: "Automated follow-ups have stopped", view: "outreach", tone: "reply" },
    unconfirmed.length && { title: `${unconfirmed.length} submission${unconfirmed.length === 1 ? "" : "s"} need proof`, detail: "Check Gmail or add manual confirmation", view: "pipeline", tone: "verify" },
    upcoming.length && { title: `${upcoming.length} interview workspace${upcoming.length === 1 ? "" : "s"}`, detail: "Practice SQL, STAR stories, and your 30/60/90 plan", view: "interviews", tone: "interview" }
  ].filter(Boolean);
  const aiUsed = (state.aiUsage || []).reduce((sum, row) => sum + Number(row.requests || 0), 0);
  const aiBudget = Number(state.settings.aiDailyBudget || 4);
  const recentTask = (state.queuedTasks || [])[0];
  app.innerHTML = `<section class="inbox-hero"><div><span>One prioritized queue</span><h2>${actions.length ? `${actions.length} action${actions.length === 1 ? " needs" : "s need"} attention` : "You are caught up"}</h2><p>Matches, application proof, recruiter replies, and interviews are ordered here.</p></div><button class="primary-button" data-action="scan">Scan official sources</button></section>
    <section class="summary-grid">${metric("Strong new matches", strong.length, "75% fit or higher")}${metric("Follow-ups due", due.length, "Approval required")}${metric("Replies", replies.length, "Automation stops")}${metric("Interviews", upcoming.length, "Prep workspaces")}</section>
    <div class="inbox-layout"><section><div class="section-heading"><div><h2>Next actions</h2><p>Open an item to continue the exact workflow.</p></div></div><div class="action-feed">${actions.length ? actions.map(item => `<button class="action-feed-item ${item.tone}" data-action="go-view" data-view-target="${item.view}"><span class="action-symbol"></span><span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.detail)}</small></span><b>Open</b></button>`).join("") : `<div class="empty-state"><h2>No action needed</h2><p>ApplyPilot will add fresh matches, confirmations, replies, and interviews here.</p></div>`}</div></section>
    <aside class="panel system-glance"><h2>Automation today</h2><dl><div><dt>Scanner</dt><dd>${state.settings.searchPaused ? "Paused" : "Active"}</dd></div><div><dt>Last queued task</dt><dd>${escapeHtml(recentTask?.status || "No queued run")}</dd></div><div><dt>AI resume budget</dt><dd>${Math.min(aiUsed, aiBudget)} / ${aiBudget}</dd></div><div><dt>Fallback</dt><dd>Deterministic and truthful</dd></div></dl></aside></div>`;
}

function renderInterviews() {
  const rows = (state.interviews || []).map(workspace => {
    const application = state.applications.find(item => item.id === workspace.application_id);
    return { ...workspace, application, prep: parseJson(workspace.prep_json, {}) };
  });
  app.innerHTML = `<section class="focus-strip"><div class="focus-copy"><span>Interview cockpit</span><h2>${rows.length ? `${rows.length} preparation workspace${rows.length === 1 ? "" : "s"}` : "No interview workspace yet"}</h2><p>JD-specific questions, SQL practice, STAR stories, and a 30/60/90 outline stay with each application.</p></div></section><div class="interview-list">${rows.length ? rows.map(row => `<article class="panel interview-card"><div class="section-heading"><div><span class="badge new">${escapeHtml(row.application?.rawStage || "PREP")}</span><h2>${escapeHtml(row.application?.title || "Interview preparation")}</h2><p>${escapeHtml(row.application?.company || "Tracked application")}</p></div></div><div class="interview-grid"><section><h3>Focus skills</h3><p>${escapeHtml((row.prep.focusSkills || []).join(", ") || "Review the complete JD")}</p><h3>Likely questions</h3><ol>${(row.prep.questions || []).slice(0, 5).map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ol></section><section><h3>SQL practice</h3><ul>${(row.prep.sqlPractice || []).map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul><h3>STAR stories</h3><ul>${(row.prep.starPrompts || []).map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul></section><section><h3>30 / 60 / 90</h3><ul>${(row.prep.plan306090 || []).map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul><h3>Ask the interviewer</h3><ul>${(row.prep.interviewerQuestions || []).map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul></section></div></article>`).join("") : `<div class="empty-state"><h2>No preparation workspace</h2><p>Create one from an application resume pack when an interview is scheduled.</p><button class="secondary-button" data-action="go-view" data-view-target="pipeline">Open pipeline</button></div>`}</div>`;
}

function renderToday() {
  const available = state.jobs.filter(isReviewMatch);
  const saved = state.jobs.filter(job => job.status === "shortlisted" && !["internship", "freelance"].includes(job.opportunityType));
  const reviewFilter = state.reviewFilter || state.settings.savedFilter || "matches";
  const rawVisible = reviewFilter === "saved" ? saved : reviewFilter === "strong" ? available.filter(job => job.score >= 75) : reviewFilter === "auto" ? available.filter(job => job.automationDecision === "auto_submit") : reviewFilter === "input" ? available.filter(job => job.automationDecision === "needs_input") : reviewFilter === "approval" ? available.filter(job => ["approval", "unclassified"].includes(job.automationDecision)) : available;
  const pageSize = Number(state.jobsVisible || 20);
  const visible = rawVisible.slice(0, pageSize);
  const hasMore = rawVisible.length > visible.length;
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
      ${filterMetric("Auto-submit", available.filter(job => job.automationDecision === "auto_submit").length, "auto")}
      ${filterMetric("Needs approval", available.filter(job => ["approval", "unclassified"].includes(job.automationDecision)).length, "approval")}
      ${filterMetric("Needs input", available.filter(job => job.automationDecision === "needs_input").length, "input")}
      ${metric("Applied / follow-up", `${activeApps} / ${followupsReady}`, "Confirmed pipeline and drafts")}
    </section>
    <div class="content-grid">
      <section>
        <div class="section-heading"><div><h2>Opportunity queue</h2><p>Every role shows what ApplyPilot can safely do next.</p></div><div class="section-actions"><button class="text-button" data-action="show-matches" data-filter="matches">All</button><button class="text-button" data-action="show-matches" data-filter="auto">Auto-submit</button><button class="text-button" data-action="show-matches" data-filter="approval">Approve</button><button class="text-button" data-action="show-matches" data-filter="input">Needs input</button><button class="text-button" data-action="show-matches" data-filter="saved">Saved</button><button class="text-button" data-action="${remoteEnabled ? "scan" : "reset"}">${remoteEnabled ? "Refresh" : "Reset demo"}</button></div></div>
        <div class="job-list">
          ${visible.length ? visible.map(jobCard).join("") + (hasMore ? `<button class="secondary-button" style="margin-top:10px;width:100%" data-action="load-more-jobs">Show ${Math.min(20, rawVisible.length - visible.length)} more · ${visible.length}/${rawVisible.length}</button>` : "") : `<div class="empty-state"><h2>${reviewFilter === "saved" ? "No saved roles" : "No current matches"}</h2><p>${reviewFilter === "saved" ? "Use Save for later on a role you may apply to within 30 days." : "The scanner is running, but it will not fill this list with weak full-time matches."}</p><button class="primary-button" data-action="scan">Run job scan</button></div>`}
        </div>
      </section>
      <aside class="panel activity-panel">
        <div class="section-heading"><div><h2>Agent activity</h2><p>Latest automated actions</p></div></div>
        <div class="activity-list">${state.activity.slice(0, 5).map(item => { const f=friendlyActivity(item); return `<div class="activity-item"><span class="activity-dot">${f.icon}</span><p>${escapeHtml(f.friendly)}</p><time>${escapeHtml(f.ago)}</time></div>`; }).join("")}</div>
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
  const feedback = (state.feedback || []).find(item => item.job_id === job.id)?.relevance;
  const decision = ({ auto_submit: "Auto-submit eligible", approval: "Your approval", needs_input: "Needs information", skip: "Below policy" })[job.automationDecision] || "Awaiting policy check";
  const capability = job.automationCapability?.submission ? "Candidate API available" : "Official portal handoff";
  return `<article class="job-card" data-job-id="${job.id}">
    <div class="company-logo" style="background:${job.color}">${job.initials}</div>
    <div>
      <div class="match-summary"><strong>${job.score}% ${fitLabel}</strong><span>${escapeHtml(skillReason)}</span><span>${escapeHtml(experienceReason)}</span></div><div class="job-title-row"><h3 class="job-title">${job.title}</h3><span class="badge new">${readiness}</span></div>
      <p class="job-company">${job.company}</p><div class="automation-line"><span class="automation-pill ${escapeHtml(job.automationDecision)}">${escapeHtml(decision)}</span><small>${escapeHtml(capability)}</small></div>${job.riskFlags?.length ? `<p class="risk-note">Review: ${escapeHtml(job.riskFlags.join("; "))}</p>` : ""}
      <div class="job-meta"><span>${job.location}</span><span>${job.mode}</span><span>${job.salary}</span><span>${job.source}</span></div>
    </div>
    <div class="score-block"><div class="score">${job.score}%</div><div class="score-label">MATCH</div></div>
    <div class="job-actions">
      <div class="relevance-controls" aria-label="Teach matching"><span>Useful?</span><button class="icon-choice ${feedback === 1 ? "selected" : ""}" title="Relevant" data-action="feedback" data-id="${job.id}" data-relevance="1">Yes</button><button class="icon-choice ${feedback === -1 ? "selected" : ""}" title="Not relevant" data-action="feedback" data-id="${job.id}" data-relevance="-1">No</button></div>
      <button class="secondary-button" data-action="skip" data-id="${job.id}">Skip</button>
      <button class="secondary-button" data-action="save" data-id="${job.id}">Save for later</button>
      <button class="secondary-button" data-action="details" data-id="${job.id}">Review</button>
      <button class="primary-button" data-action="approve" data-id="${job.id}">${job.automationDecision === "auto_submit" ? "Review auto-submit" : "Approve & prepare"}</button>
    </div>
  </article>`;
}

function renderInternships() {
  const internships = state.jobs.filter(job => job.status === "new" && job.opportunityType === "internship");
  const prepared = state.applications.filter(item => item.opportunityType === "internship" && !["closed", "rejected"].includes(item.rawStage));
  const preparedMarkup = prepared.length ? `<section class="section-stack"><div class="section-heading"><div><h2>Your early-career applications</h2><p>Prepared roles stay visible here until they are closed, so you can return to the resume pack and follow-up history.</p></div></div><div class="internship-list">${prepared.map(item => `<article class="internship-card prepared-internship"><div class="internship-head"><div><span class="lead-provider">${escapeHtml(item.stage).toUpperCase()}</span><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.company)}</p></div><strong>${item.tailoredScore || item.score || 0}% fit</strong></div><div class="internship-facts"><span><small>Stage</small>${escapeHtml(item.stage === "approved" ? "Ready to apply" : item.stage)}</span><span><small>Resume</small>${item.tailoredResumeId ? "Tailored pack saved" : "Not created"}</span><span><small>Updated</small>${escapeHtml(item.updated || "Recently")}</span></div><div class="internship-actions"><button class="secondary-button" data-action="review-pack" data-id="${escapeHtml(item.id)}">Review resume pack</button><button class="secondary-button" data-action="open-application" data-url="${escapeHtml(item.applyUrl || "")}">Open application</button></div></article>`).join("")}</div></section>` : "";
  app.innerHTML = `<section class="focus-strip"><div class="focus-copy"><span>Official early-career roles</span><h2>${internships.length ? `${internships.length} early-career opportunit${internships.length === 1 ? "y" : "ies"}` : prepared.length ? "Your early-career application is ready" : "No early-career opportunities yet"}</h2><p>This is intentionally broader: internships, graduate, trainee, apprentice, and fresher roles from official boards. Pay and transferable skills are shown before you spend time applying.</p></div></section><section class="summary-grid"><article class="metric"><span>Open early-career roles</span><strong>${internships.length}</strong><small>Official postings only</small></article><article class="metric"><span>Prepared applications</span><strong>${prepared.length}</strong><small>Kept here for tracking</small></article><article class="metric"><span>Search approach</span><strong>Broad</strong><small>Includes transferable roles</small></article><article class="metric"><span>Freshness window</span><strong>${state.settings.freshnessHours || 72}h</strong><small>Older postings are hidden</small></article></section><div class="section-heading"><div><h2>Early Career & Internships</h2><p>Automatically scored official postings with pay, skills, timing, and a short summary.</p></div><button class="text-button" data-action="scan">Refresh sources</button></div><div class="internship-list">${internships.length ? internships.map(internshipCard).join("") : `<div class="empty-state"><h2>No current early-career match</h2><p>The last official-board scan did not return an internship, graduate, trainee, apprentice, or fresher role that fits the India-wide search. Refreshing checks the boards again.</p><button class="primary-button" data-action="scan">Run job scan</button></div>`}</div>${preparedMarkup}`;
}

function renderFreelance() {
  const freelanceJobs = state.jobs.filter(job => job.status === "new" && job.opportunityType === "freelance");
  const prepared = state.applications.filter(item => item.opportunityType === "freelance" && !["closed", "rejected"].includes(item.rawStage));
  const preparedMarkup = prepared.length ? `<section class="section-stack"><div class="section-heading"><div><h2>Your freelance applications</h2><p>Prepared gigs stay visible here until they are closed.</p></div></div><div class="internship-list">${prepared.map(item => `<article class="internship-card prepared-internship"><div class="internship-head"><div><span class="lead-provider">${escapeHtml(item.stage).toUpperCase()}</span><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.company)}</p></div><strong>${item.tailoredScore || item.score || 0}% fit</strong></div><div class="internship-facts"><span><small>Stage</small>${escapeHtml(item.stage === "approved" ? "Ready to apply" : item.stage)}</span><span><small>Resume</small>${item.tailoredResumeId ? "Tailored pack saved" : "Not created"}</span><span><small>Updated</small>${escapeHtml(item.updated || "Recently")}</span></div><div class="internship-actions"><button class="secondary-button" data-action="review-pack" data-id="${escapeHtml(item.id)}">Review resume pack</button><button class="secondary-button" data-action="open-application" data-url="${escapeHtml(item.applyUrl || "")}">Open application</button></div></article>`).join("")}</div></section>` : "";
  app.innerHTML = `<section class="focus-strip"><div class="focus-copy"><span>Freelance & contract gigs</span><h2>${freelanceJobs.length ? `${freelanceJobs.length} freelance opportunit${freelanceJobs.length === 1 ? "y" : "ies"}` : prepared.length ? "Your freelance application is ready" : "No freelance gigs yet"}</h2><p>Contract, freelance, hourly and project-based roles from official boards. Hyd / Bangalore / Remote India only. Budget and transferable skills shown.</p></div></section><section class="summary-grid"><article class="metric"><span>Open freelance gigs</span><strong>${freelanceJobs.length}</strong><small>Official postings only</small></article><article class="metric"><span>Prepared applications</span><strong>${prepared.length}</strong><small>Kept for tracking</small></article><article class="metric"><span>Search approach</span><strong>Broad</strong><small>Includes contract/hourly roles</small></article><article class="metric"><span>Freshness window</span><strong>${state.settings.freshnessHours || 72}h</strong><small>Older gigs hidden</small></article></section><div class="section-heading"><div><h2>Freelance & Contracts</h2><p>Automatically scored freelance/contract postings with budget, skills, timing and summary.</p></div><button class="text-button" data-action="scan">Refresh sources</button></div><div class="internship-list">${freelanceJobs.length ? freelanceJobs.map(freelanceCard).join("") : `<div class="empty-state"><h2>No current freelance match</h2><p>Last scan found no freelance, contract, hourly or project-based role for Hyd/Bangalore. Add a freelance source (e.g., contract board) or refresh.</p><button class="primary-button" data-action="scan">Run job scan</button></div>`}</div>${preparedMarkup}`;
}

function freelanceCard(job) {
  const skillPool = String(state.settings.requiredSkills || "").split(",").map(skill => skill.trim()).filter(Boolean);
  const skills = skillPool.filter(skill => String(job.description || "").toLowerCase().includes(skill.toLowerCase())).slice(0, 4);
  const timing = job.age ? new Intl.DateTimeFormat("en", { day: "numeric", month: "short" }).format(new Date(job.age)) : "Posting date not listed";
  const budget = job.salary && job.salary !== "Salary not listed" ? job.salary : "Budget not listed";
  const sentence = String(job.description || "").replace(/\s+/g, " ").split(/(?<=[.!?])\s/)[0] || "Freelance/contract posting. Open details to check requirements.";
  const eligibleForPack = job.score >= Number(state.settings.tailoringMinimumScore || 50);
  const summary = `${sentence.slice(0, 260)} ${skills.length ? `Relevant skills: ${skills.join(", ")}.` : "Shown as transferable-skills option."}`;
  return `<article class="internship-card freelance-accent"><div class="internship-head"><div><span class="lead-provider">${escapeHtml(job.source)} | FREELANCE</span><h3>${escapeHtml(job.title)}</h3><p>${escapeHtml(job.company)} | ${escapeHtml(job.location)}</p></div><strong>${job.score}% fit</strong></div><div class="internship-facts"><span><small>Budget</small>${escapeHtml(budget)}</span><span><small>Posted</small>${escapeHtml(timing)}</span><span><small>Relevant skills</small>${escapeHtml(skills.join(", ") || "Transferable")}</span></div><div class="internship-actions"><button class="secondary-button" data-action="toggle-intern-summary" data-id="${escapeHtml(job.id)}">What this gig is</button><button class="secondary-button" data-action="details" data-id="${escapeHtml(job.id)}">Review JD</button>${eligibleForPack ? `<button class="primary-button" data-action="approve" data-id="${escapeHtml(job.id)}">Prepare resume</button>` : `<button class="secondary-button" data-action="details" data-id="${escapeHtml(job.id)}">Below resume gate</button>`}</div><p class="internship-summary" id="intern-summary-${escapeHtml(job.id)}" hidden>${escapeHtml(summary)}</p></article>`;
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
        <article class="pipeline-card"><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.company)}</p><div style="display:flex; gap:6px; margin:6px 0;"><span class="submission-pill ${escapeHtml(item.submissionStatus)}">${escapeHtml(submissionLabel(item.submissionStatus))}</span>${item.tailoredScore ? `<span class="badge new" style="font-size:10px;">${item.tailoredScore || item.score}%</span>` : ""}</div><div class="application-meta"><span>${item.tailoredResumeId ? "Pack ready" : "Draft"}</span><span>${escapeHtml(item.submittedAt || item.updated || "")}</span></div>${item.tailoredResumeId ? `<button class="primary-button" style="width:100%; margin-top:8px; min-height:36px; font-size:12px;" data-action="review-pack" data-id="${escapeHtml(item.id)}">Review pack</button>` : ""}${item.submissionStatus === "submitted_unconfirmed" ? `<button class="text-button" style="width:100%; margin-top:6px;" data-action="verify-submission" data-id="${escapeHtml(item.id)}">Add proof</button>` : ""}</article>`).join("")}</div>`;
    }).join("")}</div></section>`;
}

function submissionLabel(status) {
  return ({ not_started: "Not started", form_opened: "Form opened", submitted_unconfirmed: "Unconfirmed", confirmed: "Confirmed" })[status] || "—";
}

function renderOutreach() {
  const pending = state.outreach.filter(item => item.status === "draft" || item.status === "approved").length;
  app.innerHTML = `<div class="section-heading"><div><h2>Email queue</h2><p>${pending ? `${pending} follow-up${pending === 1 ? "" : "s"} awaiting approval` : "Follow-ups stop automatically when a recruiter replies"}</p></div></div>
    <section class="panel outreach-wrap"><table class="outreach-table"><thead><tr><th>Contact</th><th>Opportunity</th><th>Status</th><th>Timing</th><th></th></tr></thead><tbody>
      ${state.outreach.length ? state.outreach.map(item => `<tr><td class="contact-cell"><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.email || item.company)}</span></td><td>${escapeHtml(item.role)}</td><td><span class="status ${escapeHtml(item.label)}">${escapeHtml(item.label)}</span></td><td>${escapeHtml(item.timing)}</td><td><div class="table-actions">${["draft", "approved"].includes(item.status) ? `<button class="primary-button compact-button" data-action="approve-send-followup" data-id="${escapeHtml(item.id)}">Approve & send</button><button class="text-button danger-button" data-action="cancel-followup" data-id="${escapeHtml(item.id)}">Cancel</button>` : `<button class="text-button" data-action="outreach" data-id="${escapeHtml(item.id)}">View</button>`}</div></td></tr>`).join("") : `<tr><td colspan="5" class="empty-row">No recruiter follow-ups yet. Create one from a prepared application.</td></tr>`}
    </tbody></table></section>`;
}

function renderHealth() {
  const runs = state.sourceHealth || [];
  const latestBySource = runs.filter((run, index) => runs.findIndex(candidate => candidate.source_key === run.source_key) === index);
  const healthy = latestBySource.filter(run => run.status === "success").length;
  const failed = latestBySource.filter(run => run.status === "failed").length;
  const lastTask = (state.taskRuns || [])[0];
  const evaluation = state.evaluation;
  const sourceRows = latestBySource.length ? latestBySource.map(run => `<article class="health-row"><div><strong>${escapeHtml(run.label)}</strong><small>${escapeHtml(run.provider)} | ${escapeHtml(run.created_at)}</small></div><span class="status ${run.status === "success" ? "sent" : "due"}">${escapeHtml(run.status)}</span><span>${run.jobs_seen} checked</span><span>${run.duration_ms} ms</span><small>${escapeHtml(run.error || `${run.new_matches} new matches`)}</small></article>`).join("") : `<div class="empty-state"><h2>No scan telemetry yet</h2><p>Run a job scan to record source response time, retries, and failures.</p></div>`;
  app.innerHTML = `<section class="summary-grid">${metric("Healthy sources", healthy, "Latest attempt")}${metric("Source issues", failed, "Retried automatically")}${metric("Matching accuracy", evaluation ? `${evaluation.accuracy}%` : "Not run", "Baseline evaluation")}${metric("Document snapshots", (state.documentVersions || []).length, "Immutable history")}</section>
    <div class="health-grid"><section class="panel"><div class="section-heading"><div><h2>Source health</h2><p>Every official board attempt is timed and retried up to three times.</p></div></div><div class="health-list">${sourceRows}</div></section>
    <section class="panel health-summary"><h2>Reliability</h2><dl><div><dt>Authentication</dt><dd>${state.authMode === "access" ? "Cloudflare Access" : "Private API token"}</dd></div><div><dt>Last workflow</dt><dd>${escapeHtml(lastTask?.status || "No run")}</dd></div><div><dt>Retries used</dt><dd>${lastTask?.retry_count || 0}</dd></div><div><dt>Offline support</dt><dd>${navigator.onLine ? "Online" : "Offline cache active"}</dd></div></dl><button class="primary-button" data-action="run-evaluation">Run accuracy evaluation</button></section></div>
    <section class="panel evaluation-panel"><h2>Matching evaluation</h2>${evaluation ? `<p><strong>${evaluation.passed}/${evaluation.total}</strong> labelled cases passed. Precision ${evaluation.precision_score}% and recall ${evaluation.recall_score}%.</p><p class="job-company">This tests matching logic against known positive and negative roles. It is a regression signal, not a promise of recruiter response.</p>` : `<p class="job-company">No evaluation has been run against the current matching rules.</p>`}</section>`;
}

function renderSettings() {
  const s = state.settings;
  app.innerHTML = `<div class="settings-grid">
    <section class="panel settings-section"><h2>Search profile</h2>
      <div class="field"><label for="role">Primary target designation</label><input id="role" value="${escapeHtml(s.role)}"><small>Your highest-priority role for matching.</small></div>
      <div class="field"><label for="alternate-titles">Additional target designations</label><textarea id="alternate-titles" rows="4" placeholder="Business Intelligence Analyst, Analytics Engineer, Junior Data Engineer">${escapeHtml(s.alternateTitles || "")}</textarea><small>Enter multiple roles separated by commas. Every role is included in job matching.</small></div>
      <div class="field"><label for="internship-titles">Internship designations</label><textarea id="internship-titles" rows="3" placeholder="Data Analyst Intern, Business Intelligence Intern">${escapeHtml(s.internshipTitles || "Data Analyst Intern,Business Intelligence Intern,Data Engineering Intern,Analytics Intern")}</textarea><small>These appear in the separate Internships section.</small></div>
      <div class="field"><label for="freelance-titles">Freelance designations</label><textarea id="freelance-titles" rows="3" placeholder="Freelance Data Analyst, Contract BI Analyst, Hourly SQL Consultant">${escapeHtml(s.freelanceTitles || "Freelance Data Analyst,Contract Analyst,Hourly Consultant,Gig Data Analyst")}</textarea><small>These appear in the Freelance section. Hyd/Bangalore/Remote India only.</small></div>
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
      <div class="field"><label for="automation-mode">Application automation</label><select id="automation-mode"><option value="approval" ${s.automationMode !== "auto" ? "selected" : ""}>Approval required</option><option value="auto" ${s.automationMode === "auto" ? "selected" : ""}>Auto-submit when safely supported</option></select><small>Protected portals always require a handoff. A job is never marked applied without submission evidence.</small></div>
      <div class="field"><label for="auto-score">Automatic submission score</label><input id="auto-score" type="number" min="80" max="100" value="${s.autoApplyMinScore || 88}"></div>
      <div class="field"><label for="approval-score">Approval queue score</label><input id="approval-score" type="number" min="50" max="95" value="${s.approvalMinScore || 65}"></div>
      <div class="field"><label for="auto-limit">Maximum automatic submissions per day</label><input id="auto-limit" type="number" min="1" max="10" value="${s.autoApplyDailyLimit || 3}"></div>
      <div class="field"><label for="trusted-companies">Trusted companies for auto-submit</label><textarea id="trusted-companies" rows="3" placeholder="Leave empty to allow any verified official company">${escapeHtml(s.trustedCompanies || "")}</textarea></div>
      <div class="field"><label for="blocked-companies">Never apply to</label><textarea id="blocked-companies" rows="3" placeholder="Comma-separated company names">${escapeHtml(s.blockedCompanies || "")}</textarea></div>
      <button class="secondary-button" data-action="reassess-automation">Reassess active jobs</button>
      ${toggle("approval", "Approve every application", s.approval)}
      ${toggle("followups", "Prepare automatic follow-ups", s.followups)}
      ${toggle("browserNotifications", "Browser notifications", s.browserNotifications)}
      ${toggle("feedbackLearning", "Learn from relevant / not relevant feedback", s.feedbackLearning)}
      <div class="field"><label for="ai-budget">AI resume packs per day</label><input id="ai-budget" type="number" min="1" max="30" value="${s.aiDailyBudget || 12}"><small>After this limit, truthful deterministic tailoring remains available for free. Personal use suggested: 12-15.</small></div>
      <div class="field" style="margin-top:16px"><label for="api-token">Private API token</label><input id="api-token" type="password" placeholder="Only needed after deployment" value="${getApiToken() || ""}">${isTokenExpiringSoon() ? `<small style="color:#b45309">Token expires soon — refresh it in Cloudflare Workers.</small>` : ""}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:20px"><button class="secondary-button" data-action="connect">Test backend</button><button class="secondary-button" data-action="export-data">Export data</button>${remoteEnabled ? "" : `<button class="secondary-button danger-button" data-action="reset">Reset demo</button>`}</div>
    </section>
    <section class="panel settings-section" style="grid-column:1/-1"><h2>Appearance & comfort</h2>
      ${toggle("compactView", "Compact card view (more jobs per screen)", s.compactView)}
      ${toggle("reduceMotion", "Reduce animations (calmer feel)", s.reduceMotion)}
      <div class="field"><label for="font-scale">Text size</label><select id="font-scale"><option value="small" ${s.fontScale==="small"?"selected":""}>Small</option><option value="medium" ${!s.fontScale||s.fontScale==="medium"?"selected":""}>Medium (recommended)</option><option value="large" ${s.fontScale==="large"?"selected":""}>Large</option></select><small>One-stop should never feel cramped — pick what your eyes like.</small></div>
      <div class="field"><label for="saved-filter">Default Review filter</label><select id="saved-filter"><option value="matches" ${s.savedFilter==="matches"||!s.savedFilter?"selected":""}>All matches</option><option value="approval" ${s.savedFilter==="approval"?"selected":""}>Needs approval only</option><option value="strong" ${s.savedFilter==="strong"?"selected":""}>Strong 75%+ only</option><option value="saved" ${s.savedFilter==="saved"?"selected":""}>Saved for later</option></select><small>Your Review queue opens with this filter.</small></div>
    </section>
    <section class="panel settings-section" style="grid-column:1/-1"><h2>Job sources</h2>
      <div class="preset-row"><strong>Recommended public boards</strong><span>${SOURCE_PRESETS.map(source => `<button class="preset-button" data-action="add-preset" data-preset="${source.organization}">${source.label}</button>`).join("")}</span></div>
      <div class="settings-grid"><div class="field"><label for="source-provider">Provider</label><select id="source-provider"><option value="greenhouse">Greenhouse</option><option value="lever">Lever</option><option value="ashby">Ashby</option><option value="smartrecruiters">SmartRecruiters</option><option value="workable">Workable</option><option value="recruitee">Recruitee</option><option value="careerpage">Official career page (JSON-LD)</option></select></div><div class="field"><label for="source-org">Board identifier or official URL</label><input id="source-org" placeholder="companyname or https://company.com/careers"></div></div>
      <div class="field"><label for="source-label">Company label</label><input id="source-label" placeholder="Company name shown in the app"></div>
      <button class="secondary-button" data-action="add-source">Add source</button>
      <div class="panel" style="margin-top:14px; background: var(--surface-alt);"><h3 style="margin:0 0 8px; font-size:13px;">Bulk add career pages (one per line)</h3><p class="job-company" style="margin:0 0 8px;">Paste official careers URLs. Every valid page will be checked every 5 min and matching jobs auto-appear in Review.</p><textarea id="bulk-career-urls" rows="3" placeholder="https://razorpay.com/careers&#10;https://careers.swiggy.com&#10;https://www.atlassian.com/careers"></textarea><div style="display:flex; gap:8px; margin-top:8px;"><button class="primary-button" data-action="add-bulk-career">Add all career pages</button><button class="text-button" data-action="preview-bulk-career">Preview</button><span id="bulk-preview" class="job-company" style="align-self:center;"></span></div></div>
      <div class="job-list" style="margin-top:14px">${(state.sources || []).map(source => `<div class="toggle-row"><span><strong>${source.label}</strong> · ${source.provider}/${source.organization} ${source.last_error ? `<small style="color:var(--red)">• ${escapeHtml(source.last_error.slice(0,40))}</small>` : `<small style="color:var(--green)">• live</small>`}</span><button class="text-button danger-button" data-action="delete-source" data-id="${source.id}">Remove</button></div>`).join("") || `<p class="job-company">No live sources configured yet. Add a company career page above.</p>`}</div>
    </section>
    <section class="panel settings-section" style="grid-column:1/-1"><h2>Resume variants</h2><div class="job-list">${(state.resumeVariants || []).map(variant => `<div class="toggle-row"><span><strong>${escapeHtml(variant.name)}</strong><small>${escapeHtml(variant.target_titles)}</small></span><span class="badge">${escapeHtml(variant.filename)}</span></div>`).join("") || `<p class="job-company">No variants configured.</p>`}</div></section>
    <section class="panel settings-section" style="grid-column:1/-1"><h2>Application answer library</h2><p class="job-company">Save verified answers for protected application forms. Copy them into official portals; ApplyPilot does not auto-submit forms.</p><div class="settings-grid">${[{ key: "notice_period", label: "Notice period" }, { key: "expected_ctc", label: "Expected CTC" }, { key: "work_authorization", label: "Work authorization" }, { key: "linkedin", label: "LinkedIn URL" }, { key: "portfolio", label: "Portfolio URL" }].map(field => { const answer = (state.answers || []).find(item => item.key === field.key) || {}; return `<div class="field"><label for="answer-${field.key}">${field.label}</label><input id="answer-${field.key}" value="${escapeHtml(answer.value || "")}" placeholder="Add your verified answer"></div>`; }).join("")}</div><button class="secondary-button" data-action="save-answers">Save answer library</button></section>
    <section class="panel settings-section" style="grid-column:1/-1"><div class="section-heading"><div><h2>Upload your current resume</h2><p>One-stop: upload PDF and we search jobs around it + pre-fill evidence.</p></div></div>
      <div class="panel" id="resume-drop" style="border:2px dashed var(--line-strong); border-radius:14px; background: var(--surface-alt); padding:18px; text-align:center; transition: all .16s;">
        <input id="resume-file" type="file" accept=".pdf,.txt,.tex,.json" hidden>
        <p style="margin:0; font-weight:700;">Drop your resume PDF here or <button class="text-button" data-action="pick-resume" style="font-weight:800;">choose file</button></p><p class="job-company" style="margin:6px 0 0;">PDF, TXT, LaTeX or JSON • stays in your D1 • used to set skills & search</p>
        <div id="resume-parse-status" class="job-company" style="margin-top:10px;"></div>
        <div id="resume-preview" style="margin-top:12px; text-align:left; display:none;"><textarea id="resume-text-preview" rows="6" style="width:100%; padding:10px; border:1px solid var(--line); border-radius:10px; font-family: monospace; font-size:11px;"></textarea><div style="display:flex; gap:8px; margin-top:8px; flex-wrap:wrap;"><button class="primary-button" data-action="confirm-resume-parse">Use this to set my search & evidence</button><button class="text-button" data-action="clear-resume-parse">Clear</button><label class="check-row" style="margin:0;"><input id="keep-latex" type="checkbox" checked> Keep LaTeX too (advanced)</label></div></div>
      </div>
    </section>
    <section class="panel settings-section" style="grid-column:1/-1"><div class="section-heading"><div><h2>Verified resume evidence</h2><p>Only confirmed evidence can be added to AI-generated resumes.</p></div></div>
      <div class="evidence-form"><div class="field"><label for="evidence-type">Type</label><select id="evidence-type"><option value="project">Project</option><option value="experience">Experience</option><option value="certification">Certification</option><option value="skill">Skill</option><option value="achievement">Achievement bullet</option></select></div><div class="field"><label for="evidence-title">Title</label><input id="evidence-title" placeholder="Project, certification, role, or skill"></div><div class="field"><label for="evidence-context">Company, technology, or target entry</label><input id="evidence-context" placeholder="Example: DataBeat or SQL, Power BI"></div><div class="field"><label for="evidence-dates">Dates</label><input id="evidence-dates" placeholder="Example: Aug 2026"></div><div class="field evidence-wide"><label for="evidence-bullets">Verified details</label><textarea id="evidence-bullets" rows="3" placeholder="One truthful bullet per line"></textarea></div><div class="field evidence-wide"><label for="evidence-source">Evidence link or source</label><input id="evidence-source" placeholder="GitHub, credential URL, or user-confirmed"></div></div>
      <label class="check-row"><input id="evidence-confirmed" type="checkbox"> I confirm this information is accurate and can appear on my resume</label><button class="secondary-button" data-action="add-evidence">Add verified evidence</button>
      <div class="evidence-list">${(state.evidence || []).map(item => `<article><div><span class="badge ${item.verified ? "new" : ""}">${escapeHtml(item.evidence_type)}</span><strong>${escapeHtml(item.title)}</strong><small>${item.active ? "Available for tailoring" : "Paused"}</small></div><div><button class="text-button" data-action="toggle-evidence" data-id="${escapeHtml(item.id)}" data-active="${item.active ? "0" : "1"}">${item.active ? "Pause" : "Enable"}</button><button class="text-button danger-button" data-action="delete-evidence" data-id="${escapeHtml(item.id)}">Delete</button></div></article>`).join("") || `<p class="job-company">No additional evidence yet. Your verified master resume remains active.</p>`}</div></section>
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
    if (["compactView","reduceMotion"].includes(key)) toast(key==="compactView" ? (state.settings.compactView ? "Compact view on" : "Comfortable view on") : (state.settings.reduceMotion ? "Calmer animations on" : "Animations on"));
  }));
  const fontSel = document.getElementById ? document.getElementById("font-scale") : null;
  if (fontSel) fontSel.addEventListener("change", e => { state.settings.fontScale = e.target.value; saveState(); render(); toast(`Text size: ${e.target.value}`); });
  const filterSel = document.getElementById ? document.getElementById("saved-filter") : null;
  if (filterSel) filterSel.addEventListener("change", e => { state.settings.savedFilter = e.target.value; saveState(); render(); toast(`Default filter: ${e.target.value}`); });
  // Resume upload: drag-drop + file pick — becomes master for search
  const drop = document.getElementById ? document.getElementById("resume-drop") : null;
  const fileInput = document.getElementById ? document.getElementById("resume-file") : null;
  if (drop && fileInput) {
    const pick = () => fileInput.click();
    drop.querySelector('[data-action="pick-resume"]')?.addEventListener("click", pick);
    drop.addEventListener("dragover", e => { e.preventDefault(); drop.style.borderColor = "var(--green)"; drop.style.background = "var(--green-soft)"; });
    drop.addEventListener("dragleave", () => { drop.style.borderColor = ""; drop.style.background = ""; });
    drop.addEventListener("drop", async e => {
      e.preventDefault(); drop.style.borderColor = ""; drop.style.background = "";
      const f = e.dataTransfer.files[0]; if (f) await handleResumeFile(f);
    });
    fileInput.addEventListener("change", async e => { const f = e.target.files[0]; if (f) await handleResumeFile(f); });
  }
}

async function handleAction(event) {
  const { action, id } = event.currentTarget.dataset;
  if (action === "go-view") { state.activeView = event.currentTarget.dataset.viewTarget; saveState(); return render(); }
  if (action === "feedback") {
    try { await api(`/jobs/${encodeURIComponent(id)}/feedback`, { method: "PUT", body: JSON.stringify({ relevance: Number(event.currentTarget.dataset.relevance) }) }); await connectBackend(); return toast("Preference saved. Future scans will use this feedback."); }
    catch (error) { return toast(error.message, { title: "Could not save feedback", tone: "error" }); }
  }
  if (action === "verify-submission") {
    const evidence = window.prompt("What confirms this submission? Example: confirmation page or email subject.", "Confirmation page shown after submitting");
    if (!evidence) return;
    try { await api(`/applications/${encodeURIComponent(id)}/verify-submission`, { method: "POST", body: JSON.stringify({ evidence }) }); await connectBackend(); return toast("Submission marked confirmed with an audit event."); }
    catch (error) { return toast(error.message, { title: "Could not verify", tone: "error" }); }
  }
  if (action === "reload-view") return render();
  if (action === "reassess-automation") {
    try {
      const result = await api("/automation/reassess", { method: "POST" });
      await connectBackend(); render();
      return toast(`${result.evaluated} active jobs evaluated. ${result.summary.auto_submit || 0} auto-submit, ${result.summary.approval || 0} approval, ${result.summary.needs_input || 0} need input.`, { title: "Automation queue updated" });
    } catch (error) { return toast(error.message, { title: "Policy check failed", tone: "error" }); }
  }
  if (action === "approve") return await approveJob(id);
  if (action === "skip") updateJob(id, "skipped", "Job skipped and removed from your queue");
  if (action === "save") updateJob(id, "shortlisted", "Saved for later. This role is retained for 30 days.");
  if (action === "show-matches") { state.reviewFilter = event.currentTarget.dataset.filter || "matches"; state.jobsVisible = 20; saveState(); render(); }
  if (action === "load-more-jobs") { state.jobsVisible = Number(state.jobsVisible || 20) + 20; saveState(); render(); window.scrollTo({ top: document.body.scrollHeight * 0.6, behavior: "smooth" }); }
  if (action === "details") showJob(id);
  if (action === "open-application") {
    const applyUrl = event.currentTarget.dataset.url;
    if (id && remoteEnabled) api(`/applications/${encodeURIComponent(id)}/opened`, { method: "POST" }).catch(() => {});
    if (applyUrl) window.open(applyUrl, "_blank", "noopener,noreferrer");
    else toast("The official application URL is not available for this record.", { title: "Application link unavailable" });
  }
  if (action === "reset") resetDemo();
  if (action === "scan") runScan();
  if (action === "outreach") reviewOutreach(id);
  if (action === "connect") {
    setApiToken(document.querySelector("#api-token").value.trim());
    await connectBackend(false);
  }
  if (action === "add-source") await addSource();
  if (action === "add-preset") await addPreset(event.currentTarget.dataset.preset);
  if (action === "pick-resume") document.getElementById("resume-file")?.click();
  if (action === "confirm-resume-parse") await confirmResumeParse();
  if (action === "clear-resume-parse") { const el=document.getElementById("resume-preview"); if(el) el.style.display="none"; document.getElementById("resume-parse-status").textContent=""; }
  if (action === "add-bulk-career") await addBulkCareer();
  if (action === "preview-bulk-career") previewBulkCareer();
  if (action === "download-pack-pdf") await downloadPackPdf(id);
  if (action === "copy-pack-link") await copyPackLink(id);
  if (action === "save-answers") await saveAnswerLibrary();
  if (action === "add-evidence") await addEvidence();
  if (action === "toggle-evidence") await toggleEvidence(id, event.currentTarget.dataset.active === "1");
  if (action === "delete-evidence") await deleteEvidence(id);
  if (action === "delete-source") await deleteSource(id);
  if (action === "toggle-intern-summary") toggleInternSummary(id);
  if (action === "export-data") await exportData();
  if (action === "review-pack") showApplicationPack(id);
  if (action === "approve-send-followup") await approveAndSendFollowup(id);
  if (action === "cancel-followup") await cancelFollowup(id);
  if (action === "run-evaluation") {
    try {
      operationOverlay.querySelector("#operation-title").textContent = "Testing matching accuracy";
      operationOverlay.querySelector("#operation-detail").textContent = "Running labelled positive and negative job cases.";
      operationOverlay.hidden = false;
      await api("/evaluations/run", { method: "POST" });
      await connectBackend();
      toast("Accuracy evaluation completed.");
    } catch (error) {
      toast(error.message, { title: "Evaluation failed", tone: "error" });
    } finally {
      operationOverlay.hidden = true;
    }
  }
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
  const modelLabel = item.tailoredModel?.includes("llama-3.3") ? "Llama 3.3 70B" : item.tailoredModel === "deterministic-fallback" ? "AI fallback" : item.tailoredModel || "Provider unavailable";
  const versions = (state.resumeVersions || []).filter(version => String(version.application_id) === String(item.id)).sort((a, b) => b.version_number - a.version_number);
  const documentVersions = (state.documentVersions || []).filter(version => String(version.application_id) === String(item.id));
  const checklist = (state.checklist || []).filter(entry => String(entry.application_id) === String(item.id));
  const readiness = versions[0]?.changeSummary?.atsReadiness || { score: audit.verdict === "pass" && (coverage.pct == null || coverage.pct >= 60) ? 100 : 67, checks: [{ pass: Boolean(item.tailoredResume.email && item.tailoredResume.phone) }, { pass: audit.verdict === "pass" }, { pass: coverage.pct == null || coverage.pct >= 60 }] };
  const versionMarkup = versions.length ? versions.map(version => `<article><div><strong>Version ${version.version_number}</strong><small>${escapeHtml(version.instruction || "Generated for JD")}</small><small>${escapeHtml(version.changeSummary?.summary || "Saved resume snapshot")}</small></div>${version === versions[0] ? `<span class="badge new">CURRENT</span>` : `<button class="text-button" data-restore-version="${version.version_number}">Restore</button>`}</article>`).join("") : `<p class="job-company">Version history starts after the next regeneration.</p>`;
  const checklistMarkup = checklist.length ? checklist.map(entry => `<label class="workflow-check ${entry.required ? 'is-required' : ''}"><input type="checkbox" data-checklist-key="${escapeHtml(entry.item_key)}" ${entry.completed ? "checked" : ""}> <span>${escapeHtml(entry.label)}</span>${entry.required ? `<span class="req-dot" title="Required"></span>` : ""}</label>`).join("") : `<p class="job-company">Checklist will appear after this pack is refreshed.</p>`;
  const answerMarkup = (state.answers || []).filter(answer => answer.value).map(answer => `<button class="answer-copy" data-copy-answer="${escapeHtml(answer.value)}"><span>${escapeHtml(answer.label)}</span><strong>${escapeHtml(answer.value)}</strong></button>`).join("") || `<p class="job-company">Add verified screening answers in Settings.</p>`;
  const selectedProjects = (state.projectSelections || []).filter(project => String(project.job_id) === String(item.jobId));
  dialog.className = "pack-modal";
  dialog.innerHTML = `<div class="dialog-content pack-dialog"><div class="dialog-header"><div><span class="badge new">${item.tailoredScore || 0}% TAILORED</span><h2>${escapeHtml(item.title)}</h2><p class="job-company">${escapeHtml(item.company)} | ${escapeHtml(item.tailoredStatus || "review")} | ${escapeHtml(modelLabel)}</p></div><button class="dialog-close" aria-label="Close">x</button></div>
    <div class="pack-grid"><section><h3>ATS coverage</h3><strong class="pack-score">${coverage.pct ?? "-"}%</strong><p class="job-company">Matched: ${escapeHtml((coverage.matched || []).join(", ") || "No tracked keywords")}</p><p class="job-company">Missing: ${escapeHtml((coverage.missing || []).join(", ") || "None")}</p></section><section><h3>Truth audit</h3><strong>${escapeHtml(audit.verdict || "review")}</strong><p class="job-company">${Number(audit.autoCorrected || 0)} grounded corrections applied</p><p class="job-company">${escapeHtml((audit.qualityIssues || []).join(" ") || "No quality issues detected")}</p></section></div>
    <div class="match-reasons"><h3>Tailored summary</h3><p>${escapeHtml(item.tailoredResume.summary)}</p><h3>Prioritized skills</h3><p>${escapeHtml(item.tailoredResume.skills)}</p></div>
    <div class="match-reasons"><h3>Why these projects</h3>${selectedProjects.length ? `<ul>${selectedProjects.map(project => `<li><strong>${escapeHtml(project.title)}</strong>: ${escapeHtml(project.reason)} (${project.relevance_score}% evidence fit)</li>`).join("")}</ul>` : `<p>Your verified master projects were ranked against the JD. Add more projects in the Evidence Library for broader selection.</p>`}</div>
    <div class="match-reasons"><h3>Cover letter</h3><p class="prewrap">${escapeHtml(item.coverLetter || "Not generated")}</p></div>
    <section class="resume-command"><div class="resume-command-head"><h3>Make it win this JD</h3><p>AI rephrases with JD keywords — winning, not generic 1+ year. Only your verified facts are used.</p></div><textarea id="resume-instruction" rows="4" maxlength="600" placeholder="Try: Make it salesy for revenue warehouse — front-load Power BI + BigQuery, make bullets punchier, keep metrics truthful."></textarea><div class="resume-command-actions"><small>Tip: name 2 top JD keywords you want first</small><button class="primary-button" id="regenerate-resume">Create new version</button></div></section>
    <div class="workflow-grid"><section><div class="workflow-heading"><h3>ATS readiness</h3><strong>${readiness.score}%</strong></div><p class="job-company">${readiness.checks?.filter(check => check.pass).length || 0}/${readiness.checks?.length || 0} checks passed • one-page guard active</p></section><section><h3>Checklist</h3><p class="job-company" style="margin:0 0 8px; font-size:11px;">Tick as you go — required has <span class="req-dot" style="display:inline-block; vertical-align:middle;"></span></p><div class="workflow-list">${checklistMarkup}</div></section></div>
    <details class="workflow-details"><summary>Resume versions (${versions.length})</summary><div class="version-list">${versionMarkup}</div></details>
    <details class="workflow-details"><summary>Complete document history (${documentVersions.length})</summary><div class="version-list">${documentVersions.map(version => `<article><div><strong>${escapeHtml(version.kind.replace("_", " "))} v${version.version_number}</strong><small>${escapeHtml(version.created_at)}</small></div><span class="badge">${escapeHtml(version.mime_type)}</span></article>`).join("") || `<p class="job-company">No immutable document snapshots yet.</p>`}</div></details>
    <details class="workflow-details"><summary>Screening answer library</summary><div class="answer-list">${answerMarkup}</div></details>
    <div class="dialog-actions primary-actions"><button class="primary-button" id="view-resume">View resume</button><button class="primary-button" id="download-pdf">Download PDF</button>${resumeApproved ? `<span class="badge new" style="align-self:center;">Approved ✓</span>` : `<button class="primary-button" id="approve-tailored">Approve resume</button>`}</div>
    <div class="dialog-actions secondary-actions"><button class="text-button" id="download-json">JSON</button><button class="text-button" id="download-tex">LaTeX</button><button class="text-button" id="copy-pack-link" data-action="copy-pack-link" data-id="${escapeHtml(item.id)}">Copy share</button><span style="flex:1"></span><button class="secondary-button" id="open-application">Open application</button><button class="secondary-button" id="mark-applied">Mark applied</button></div>
    <button class="text-button pack-followup" id="prepare-interview">Create interview workspace</button>
    ${item.submissionStatus === "confirmed" ? `<button class="text-button pack-followup" id="create-followup">Create recruiter follow-up</button>` : `<span class="approval-note pack-followup">Follow-up unlocks after submission confirmation</span>`}</div>`;
  dialog.showModal();
  dialog.querySelector(".dialog-close").onclick = () => dialog.close();
  dialog.querySelector("#view-resume").onclick = () => showResumePreview(item);
  dialog.querySelector("#download-json").onclick = () => downloadText(`${item.company}-${item.title}.json`.replace(/[^a-z0-9.-]+/gi, "_"), JSON.stringify(item.tailoredResume, null, 2), "application/json");
  dialog.querySelector("#download-tex").onclick = () => downloadText(`${item.company}-${item.title}.tex`.replace(/[^a-z0-9.-]+/gi, "_"), item.latex || buildAtsLatex(item.tailoredResume, item), "application/x-latex");
  dialog.querySelector("#download-pdf").onclick = () => downloadResumePdf(item);
  dialog.querySelector("#regenerate-resume").onclick = async () => {
    const instruction = dialog.querySelector("#resume-instruction").value.trim();
    operationOverlay.querySelector("#operation-title").textContent = `Tailoring ${item.company} resume`;
    operationOverlay.querySelector("#operation-detail").textContent = "Workers AI is comparing the full JD with your verified experience, then running truth and ATS checks.";
    operationOverlay.hidden = false;
    dialog.close();
    try {
      const result = await api(`/applications/${encodeURIComponent(item.id)}/regenerate-resume`, { method: "POST", body: JSON.stringify({ instruction }) });
      await connectBackend();
      const refreshed = state.applications.find(application => String(application.id) === String(item.id));
      if (refreshed) showApplicationPack(refreshed.id);
      toast(`Version ${result.version} created. ${result.diff?.summary || "ATS and truth checks completed"} Readiness: ${result.readiness?.score ?? "-"}%.`, { title: "Tailored resume ready", duration: 6000 });
    } catch (error) { toast(error.message, { title: "Regeneration failed", tone: "error" }); }
    finally { operationOverlay.hidden = true; }
  };
  dialog.querySelectorAll("[data-restore-version]").forEach(button => button.onclick = async () => {
    try { await api(`/applications/${encodeURIComponent(item.id)}/resume-versions/${button.dataset.restoreVersion}/restore`, { method: "POST" }); dialog.close(); await connectBackend(); showApplicationPack(item.id); toast(`Resume version ${button.dataset.restoreVersion} restored as a new version.`); }
    catch (error) { toast(error.message, { title: "Restore failed", tone: "error" }); }
  });
  dialog.querySelectorAll("[data-checklist-key]").forEach(input => input.onchange = async () => {
    try { await api(`/applications/${encodeURIComponent(item.id)}/checklist/${encodeURIComponent(input.dataset.checklistKey)}`, { method: "PUT", body: JSON.stringify({ completed: input.checked }) }); await connectBackend(); }
    catch (error) { input.checked = !input.checked; toast(error.message, { tone: "error" }); }
  });
  dialog.querySelectorAll("[data-copy-answer]").forEach(button => button.onclick = async () => { await navigator.clipboard.writeText(button.dataset.copyAnswer); toast("Verified answer copied."); });
  dialog.querySelector("#open-application").onclick = async () => { try { await api(`/applications/${encodeURIComponent(item.id)}/opened`, { method: "POST" }); } catch {} window.open(item.applyUrl, "_blank", "noopener,noreferrer"); };
  dialog.querySelector("#mark-applied").onclick = async () => {
    try { await api(`/applications/${encodeURIComponent(item.id)}/stage`, { method: "PUT", body: JSON.stringify({ stage: "applied" }) }); dialog.close(); await connectBackend(); toast("Application marked as applied."); }
    catch (error) { toast(error.message); }
  };
  if (!resumeApproved) dialog.querySelector("#approve-tailored").onclick = async () => {
    try { await api(`/tailored-resumes/${encodeURIComponent(item.tailoredResumeId)}/approve`, { method: "POST" }); dialog.close(); await connectBackend(); toast("Resume approved. Application moved to Ready to apply."); }
    catch (error) { toast(error.message); }
  };
  dialog.querySelector("#create-followup")?.addEventListener("click", () => showFollowupComposer(item));
  dialog.querySelector("#prepare-interview").onclick = () => createInterviewWorkspace(item);
  dialog.querySelector("#copy-pack-link")?.addEventListener("click", () => copyPackLink(item.id));
}

function downloadResumePdfLegacy(item) {
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
  add(String(resume.name || state.profile.fullName).toUpperCase(), { size: 18, bold: true, align: "center", gap: 16 });
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
  section("Skills");
  if ((resume.skillsStructured || []).length) (resume.skillsStructured || []).forEach(item => {
    add(item.category, { bold: true, gap: 10 });
    wrap(item.details, 82).forEach(line => add(line, { x: left + 82, gap: 10 }));
  });
  else wrap(resume.skills).forEach(line => add(line, { gap: 10 }));
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
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "", "<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman >>", "<< /Type /Font /Subtype /Type1 /BaseFont /Times-Bold >>"];
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

let pdfFontCache;
async function loadPdfFonts() {
  if (!pdfFontCache) pdfFontCache = Promise.all([
    ["CMUSerif-Regular.ttf", "fonts/cmu-serif-500-roman.ttf", "normal"],
    ["CMUSerif-Bold.ttf", "fonts/cmu-serif-700-roman.ttf", "bold"],
    ["CMUSerif-Italic.ttf", "fonts/cmu-serif-500-italic.ttf", "italic"],
    ["CMUSerif-BoldItalic.ttf", "fonts/cmu-serif-700-italic.ttf", "bolditalic"]
  ].map(async ([name, url, style]) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Resume font failed to load (${response.status})`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    return { name, style, data: btoa(binary) };
  }));
  return pdfFontCache;
}

async function downloadResumePdf(item) {
  const resume = item.tailoredResume;
  if (!window.jspdf?.jsPDF) return toast("The PDF engine did not load. Refresh the page and try again.", { title: "PDF unavailable", tone: "error" });
  operationOverlay.querySelector("#operation-title").textContent = "Creating LaTeX-style PDF";
  operationOverlay.querySelector("#operation-detail").textContent = "Embedding Computer Modern fonts, links, and the complete resume content.";
  operationOverlay.hidden = false;
  try {
    const fonts = await loadPdfFonts();
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "pt", format: "letter", compress: true, putOnlyUsedFonts: true });
    fonts.forEach(font => { doc.addFileToVFS(font.name, font.data); doc.addFont(font.name, "CMU Serif", font.style); });
    const pageWidth = 612;
    const pageHeight = 792;
    const left = 32.4;
    const right = pageWidth - 32.4;
    const contentWidth = right - left;
    let y = 31;
    const setFont = (style = "normal", size = 10.5, color = [0, 0, 0]) => { doc.setFont("CMU Serif", style); doc.setFontSize(size); doc.setTextColor(...color); };
    const ensure = height => { if (y + height <= pageHeight - 22) return; doc.addPage("letter", "portrait"); y = 28; };
    const lines = (value, width, style = "normal", size = 10.5) => { setFont(style, size); return doc.splitTextToSize(String(value || ""), width); };
    const block = (value, { x = left, width = contentWidth, style = "normal", size = 10.5, lineHeight = 11.8, color = [0, 0, 0] } = {}) => {
      const output = lines(value, width, style, size); ensure(output.length * lineHeight); setFont(style, size, color); doc.text(output, x, y); y += output.length * lineHeight; return output;
    };
    const centered = (value, style, size, gap) => { ensure(gap); setFont(style, size); doc.text(String(value || ""), pageWidth / 2, y, { align: "center" }); y += gap; };
    const rightText = (value, style = "normal", size = 10) => { setFont(style, size); doc.text(String(value || ""), right, y, { align: "right" }); };
    const section = label => { y += 5; ensure(16); setFont("bold", 11); doc.text(label.toUpperCase(), left, y); doc.setDrawColor(50); doc.setLineWidth(.45); doc.line(left, y + 2.8, right, y + 2.8); y += 13; };
    const linkedText = (label, url, x, style = "normal", size = 10.2) => {
      setFont(style, size, [0, 0, 255]); doc.text(label, x, y); const width = doc.getTextWidth(label);
      if (url) doc.link(x, y - size, width, size + 2, { url });
      return width;
    };
    const bullets = values => (values || []).forEach(value => {
      const bulletLines = lines(value, contentWidth - 19, "normal", 9.9); ensure(bulletLines.length * 11.5);
      setFont("normal", 9.9); doc.text("•", left + 5, y); doc.text(bulletLines, left + 15, y); y += bulletLines.length * 11.5;
    });

    centered(String(resume.name || state.profile.fullName).toUpperCase(), "bold", 17.3, 17);
    centered(resume.title || item.title, "normal", 10.1, 12);
    centered([resume.phone, resume.location].filter(Boolean).join(" | "), "normal", 9.1, 10.5);
    const contacts = [
      { label: resume.email, url: resume.email ? `mailto:${resume.email}` : "" },
      { label: "LinkedIn", url: resume.linkedin },
      { label: "Portfolio Website", url: resume.website }
    ].filter(entry => entry.label);
    setFont("normal", 9.1); const separator = " | "; const contactWidth = contacts.reduce((sum, entry) => sum + doc.getTextWidth(entry.label), 0) + Math.max(0, contacts.length - 1) * doc.getTextWidth(separator);
    let contactX = (pageWidth - contactWidth) / 2;
    contacts.forEach((entry, index) => { contactX += linkedText(entry.label, entry.url, contactX); if (index < contacts.length - 1) { setFont("normal", 9.1); doc.text(separator, contactX, y); contactX += doc.getTextWidth(separator); } });
    y += 12;

    section("Summary"); block(resume.summary, { size: 10.35, lineHeight: 11.5 });
    section("Skills");
    if ((resume.skillsStructured || []).length) (resume.skillsStructured || []).forEach(row => {
      const categoryWidth = 122; const detailLines = lines(row.details, contentWidth - categoryWidth, "normal", 9.65); ensure(detailLines.length * 10.5);
      setFont("bold", 9.65); doc.text(row.category, left, y); setFont("normal", 9.65); doc.text(detailLines, left + categoryWidth, y); y += detailLines.length * 10.5;
    }); else block(resume.skills, { size: 10, lineHeight: 11 });

    section("Professional Experience");
    (resume.experienceStructured || []).forEach((entry, index) => {
      if (index) y += 5; ensure(31); setFont("bold", 10.6); doc.text(entry.role || "", left, y); rightText(entry.dates || "", "normal", 10); y += 12.3;
      setFont("bold", 9.9); doc.text(entry.company || "", left, y); rightText(entry.location || "", "italic", 9.9); y += 12; bullets(entry.bullets);
    });

    section("Projects");
    (resume.projectsStructured || []).forEach((entry, index) => {
      if (index) y += 2.5; ensure(22); linkedText(entry.name || "", entry.link, left, "bold", 10.2); rightText([entry.tech, entry.date].filter(Boolean).join(", "), "italic", 9.8); y += 11.1; bullets(entry.bullets);
    });

    section("Education & Certifications");
    (resume.educationStructured || []).forEach(entry => {
      ensure(21); setFont("bold", 10.2); doc.text(`${entry.degree || ""}${entry.school ? `, ${entry.school}` : ""}`, left, y); rightText(entry.dates || "", "normal", 9.8); y += 10.9;
      if (entry.location) { setFont("italic", 9.8); doc.text(entry.location, left, y); y += 10.7; }
    });
    const certs = resume.certificationsStructured || [];
    if (certs.length) certs.forEach((entry, index) => {
      ensure(11.2); setFont("normal", 9.5); doc.text("•", left + 5, y); linkedText(entry.name || entry, entry.link, left + 15, "normal", 9.5);
      if (index === 0 && resume.certificationDate) rightText(resume.certificationDate, "italic", 9.5);
      y += 11.2;
    });
    if (doc.getNumberOfPages() > 1) throw new Error("This resume exceeds one page. Shorten or deactivate optional evidence before downloading.");
    doc.setProperties({ title: `${item.company} - ${item.title}`, author: resume.name || state.profile.fullName, subject: "ATS-friendly tailored resume" });
    doc.save(`${item.company}-${item.title}.pdf`.replace(/[^a-z0-9.-]+/gi, "_"));
    toast("PDF downloaded with Computer Modern fonts and clickable links.", { title: "Resume ready" });
  } catch (error) { toast(error.message, { title: "PDF generation failed", tone: "error" }); }
  finally { operationOverlay.hidden = true; }
}

function buildAtsLatex(resume, item) {
  const esc = value => String(value || "").replace(/\\/g, "\\textbackslash{}").replace(/([#$%&_{}])/g, "\\$1").replace(/~/g, "\\textasciitilde{}").replace(/\^/g, "\\textasciicircum{}");
  const lines = [
    "\\documentclass{resume}", "\\usepackage[left=0.45in,top=0.3in,right=0.45in,bottom=0.3in]{geometry}", "\\usepackage{hyperref}", "\\hypersetup{colorlinks=true,urlcolor=blue}",
    `\\name{${esc(resume.name || state.profile.fullName)}}`,
    `\\address{${esc(resume.phone || "")} \\\\ ${esc(resume.location || "Hyderabad, Telangana")}}`,
    `\\address{\\href{mailto:${esc(resume.email || "")}}{${esc(resume.email || "")}} \\\\ \\href{${esc(resume.linkedin || "")}}{LinkedIn} \\\\ \\href{${esc(resume.website || "")}}{Portfolio Website}}`,
    `\\address{${esc(resume.title || item.title)}}`, "\\begin{document}", "\\vspace{-10pt}", "\\begin{rSection}{Summary}", esc(resume.summary), "\\end{rSection}",
    "\\vspace{-8pt}", "\\begin{rSection}{Skills}", esc(resume.skills), "\\end{rSection}", "\\vspace{-8pt}", "\\begin{rSection}{Professional Experience}"
  ];
  (resume.experienceStructured || []).forEach(entry => { lines.push(`\\textbf{${esc(entry.role)}} \\hfill ${esc(entry.dates)}\\\\`, `${esc(entry.company)} \\hfill \\textit{${esc(entry.location)}}`, "\\begin{itemize}", ...(entry.bullets || []).map(bullet => `\\item ${esc(bullet)}`), "\\end{itemize}", "\\vspace{2pt}"); });
  lines.push("\\end{rSection}");
  if ((resume.projectsStructured || []).length) { lines.push("\\vspace{-8pt}", "\\begin{rSection}{Projects}"); (resume.projectsStructured || []).forEach(entry => { const projectName = entry.link ? `\\href{${esc(entry.link)}}{${esc(entry.name)}}` : esc(entry.name); lines.push(`\\item \\textbf{${projectName}} \\hfill \\textit{${esc(entry.tech)}}`, "\\begin{itemize}", ...(entry.bullets || []).map(bullet => `\\item ${esc(bullet)}`), "\\end{itemize}"); }); lines.push("\\end{rSection}"); }
  if ((resume.educationStructured || []).length || (resume.certificationsStructured || []).length) { lines.push("\\vspace{-8pt}", "\\begin{rSection}{Education \\& Certifications}"); (resume.educationStructured || []).forEach(entry => lines.push(`\\textbf{${esc(entry.degree)}}, ${esc(entry.school)} \\hfill ${esc(entry.dates)}\\\\`, `\\textit{${esc(entry.location)}}`)); if ((resume.certificationsStructured || []).length) { lines.push("\\begin{itemize}"); (resume.certificationsStructured || []).forEach(entry => lines.push(`\\item ${entry.link ? `\\href{${esc(entry.link)}}{${esc(entry.name)}}` : esc(entry.name)}`)); lines.push("\\end{itemize}"); } lines.push("\\end{rSection}"); }
  lines.push("\\end{document}");
  return lines.join("\n");
}

function showResumePreview(item) {
  const resume = item.tailoredResume;
  const role = entry => `<section class="resume-entry resume-role"><h4>${escapeHtml(entry.role)} <small>${escapeHtml(entry.dates)}</small></h4><p class="resume-company">${escapeHtml(entry.company)}${entry.location ? ` <em>${escapeHtml(entry.location)}</em>` : ""}</p><ul>${(entry.bullets || []).map(bullet => `<li>${escapeHtml(bullet)}</li>`).join("")}</ul></section>`;
  const project = entry => `<section class="resume-entry"><h4>${entry.link ? `<a href="${escapeHtml(entry.link)}" target="_blank" rel="noreferrer">${escapeHtml(entry.name)}</a>` : escapeHtml(entry.name)} <small>${escapeHtml([entry.tech, entry.date].filter(Boolean).join(", "))}</small></h4><ul>${(entry.bullets || []).map(bullet => `<li>${escapeHtml(bullet)}</li>`).join("")}</ul></section>`;
  const education = entry => `<section class="resume-entry resume-education"><h4>${escapeHtml(entry.degree)}${entry.school ? `, ${escapeHtml(entry.school)}` : ""} <small>${escapeHtml(entry.dates)}</small></h4>${entry.location ? `<p>${escapeHtml(entry.location)}</p>` : ""}</section>`;
  dialog.className = "pack-modal";
  const skillRows = (resume.skillsStructured || []).length ? `<div class="resume-skills-table">${resume.skillsStructured.map(row => `<strong>${escapeHtml(row.category)}</strong><span>${escapeHtml(row.details)}</span>`).join("")}</div>` : `<p>${escapeHtml(resume.skills)}</p>`;
  dialog.innerHTML = `<div class="dialog-content resume-preview"><div class="dialog-header preview-tools"><span class="badge new">TAILORED RESUME</span><button class="dialog-close" aria-label="Close">x</button></div><article class="resume-sheet"><header><h2>${escapeHtml(resume.name || state.profile.fullName)}</h2><strong>${escapeHtml(resume.title || item.title)}</strong><p>${escapeHtml([resume.phone, resume.location].filter(Boolean).join(" | "))}</p><p><a href="mailto:${escapeHtml(resume.email || "")}">${escapeHtml(resume.email || "")}</a>${resume.linkedin ? ` | <a href="${escapeHtml(resume.linkedin)}" target="_blank" rel="noreferrer">LinkedIn</a>` : ""}${resume.website ? ` | <a href="${escapeHtml(resume.website)}" target="_blank" rel="noreferrer">Portfolio Website</a>` : ""}</p></header><section><h3>Summary</h3><p>${escapeHtml(resume.summary)}</p></section><section><h3>Skills</h3>${skillRows}</section><section><h3>Professional Experience</h3>${(resume.experienceStructured || []).map(role).join("") || "<p>No experience entries.</p>"}</section>${(resume.projectsStructured || []).length ? `<section><h3>Projects</h3>${(resume.projectsStructured || []).map(project).join("")}</section>` : ""}${(resume.educationStructured || []).length || (resume.certificationsStructured || []).length ? `<section><h3>Education &amp; Certifications</h3>${(resume.educationStructured || []).map(education).join("")}<ul class="resume-certifications">${(resume.certificationsStructured || []).map((entry, index) => `<li>${entry.link ? `<a href="${escapeHtml(entry.link)}" target="_blank" rel="noreferrer">${escapeHtml(entry.name || entry)}</a>` : escapeHtml(entry.name || entry)}${index === 0 && resume.certificationDate ? ` <small>${escapeHtml(resume.certificationDate)}</small>` : ""}</li>`).join("")}</ul></section>` : ""}</article><div class="dialog-actions"><button class="secondary-button" id="back-to-pack">Back</button><button class="primary-button" id="preview-download-pdf">Download PDF</button></div></div>`;
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

async function addEvidence() {
  const evidenceType = document.querySelector("#evidence-type").value;
  const title = document.querySelector("#evidence-title").value.trim();
  const context = document.querySelector("#evidence-context").value.trim();
  const dates = document.querySelector("#evidence-dates").value.trim();
  const bullets = document.querySelector("#evidence-bullets").value.split("\n").map(value => value.trim()).filter(Boolean);
  const sourceUrl = document.querySelector("#evidence-source").value.trim() || "user-confirmed";
  const confirmed = document.querySelector("#evidence-confirmed").checked;
  if (!title || !confirmed) return toast("Add a title and confirm the evidence is accurate.", { title: "Evidence not saved", tone: "error" });
  const details = evidenceType === "project" ? { name: title, tech: context, date: dates, link: sourceUrl.startsWith("http") ? sourceUrl : "", bullets }
    : evidenceType === "experience" ? { role: title, company: context, dates, bullets }
    : evidenceType === "certification" ? { name: title, date: dates, link: sourceUrl.startsWith("http") ? sourceUrl : "" }
    : evidenceType === "skill" ? { name: title, category: context || "Additional Skills", details: bullets.join(", ") || title }
    : { targetType: "experience", targetName: context, bullet: bullets[0] || title };
  try { await api("/evidence", { method: "POST", body: JSON.stringify({ evidenceType, title, details, sourceUrl, confirmed }) }); await connectBackend(); render(); toast("Verified evidence saved for future resume versions."); }
  catch (error) { toast(error.message, { title: "Evidence not saved", tone: "error" }); }
}

async function toggleEvidence(id, active) {
  try { await api(`/evidence/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify({ active }) }); await connectBackend(); render(); }
  catch (error) { toast(error.message, { tone: "error" }); }
}

async function deleteEvidence(id) {
  try { await api(`/evidence/${encodeURIComponent(id)}`, { method: "DELETE" }); await connectBackend(); render(); toast("Evidence removed."); }
  catch (error) { toast(error.message, { tone: "error" }); }
}

function showFollowupComposer(application) {
  const defaultSubject = `Following up on my ${application.title} application`;
  const defaultBody = `Hello,\n\nI recently applied for the ${application.title} role at ${application.company}. I am following up to reiterate my interest and ask whether there is any additional information I can provide.\n\nThank you for your time,\n${state.profile.fullName}`;
  const defaultSchedule = new Date(Date.now() + Number(state.settings.followupDays || 5) * 86400000).toISOString().slice(0, 16);
  dialog.innerHTML = `<form class="dialog-content" id="followup-form"><div class="dialog-header"><div><span class="badge new">FOLLOW-UP</span><h2>${escapeHtml(application.title)}</h2><p class="job-company">${escapeHtml(application.company)}</p></div><button type="button" class="dialog-close" aria-label="Close">x</button></div>
    <div class="field"><label for="recruiter-name">Recruiter name</label><input id="recruiter-name" placeholder="Optional"></div>
    <div class="field"><label for="recruiter-email">Recruiter email</label><input id="recruiter-email" type="email" required list="verified-contacts" placeholder="name@company.com"><datalist id="verified-contacts">${(state.contacts || []).map(contact => `<option value="${escapeHtml(contact.email)}">${escapeHtml(contact.name || "Verified contact")}</option>`).join("")}</datalist></div>
    <label class="check-row"><input id="verified-contact" type="checkbox"> I verified this recruiter contact myself</label>
    <div class="field"><label for="followup-subject">Subject</label><input id="followup-subject" required value="${escapeHtml(defaultSubject)}"></div>
    <div class="field"><label for="followup-body">Message</label><textarea id="followup-body" required rows="8">${escapeHtml(defaultBody)}</textarea></div>
    <div class="field"><label for="followup-schedule">Review/send date</label><input id="followup-schedule" type="datetime-local" value="${defaultSchedule}"><small>The message remains a draft until you approve and send it.</small></div>
    <div class="dialog-actions"><button type="button" class="secondary-button dialog-close-secondary">Cancel</button><button class="primary-button" type="submit">Save follow-up draft</button></div></form>`;
  dialog.querySelector(".dialog-close").onclick = () => dialog.close();
  dialog.querySelector(".dialog-close-secondary").onclick = () => dialog.close();
  dialog.querySelector("#followup-form").onsubmit = async event => {
    event.preventDefault();
    try {
      await api("/outreach", { method: "POST", body: JSON.stringify({ applicationId: application.id, recruiterName: dialog.querySelector("#recruiter-name").value, recruiterEmail: dialog.querySelector("#recruiter-email").value, subject: dialog.querySelector("#followup-subject").value, body: dialog.querySelector("#followup-body").value, scheduledFor: dialog.querySelector("#followup-schedule").value || null, verifiedContact: dialog.querySelector("#verified-contact").checked }) });
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

async function cancelFollowup(id) {
  try { await api(`/outreach/${encodeURIComponent(id)}/cancel`, { method: "POST" }); await connectBackend(); toast("Follow-up cancelled."); }
  catch (error) { toast(error.message, { title: "Could not cancel", tone: "error" }); }
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

async function addBulkCareer() {
  if (!remoteEnabled) return toast("Connect the cloud backend first.");
  const raw = document.querySelector("#bulk-career-urls")?.value || "";
  const urls = raw.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
  if (!urls.length) return toast("Paste at least one careers URL.");
  let added = 0;
  for (const url of urls) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:") throw new Error("HTTPS only");
      const label = parsed.hostname.replace(/^www\./, "").split(".")[0].replace(/-/g, " ");
      const pretty = label.charAt(0).toUpperCase() + label.slice(1);
      await api("/sources", { method: "POST", body: JSON.stringify({ provider: "careerpage", organization: url, label: pretty }) });
      added += 1;
    } catch (e) { toast(`${url}: ${e.message}`, { tone: "error" }); }
  }
  await connectBackend();
  toast(`${added} career pages added. They will be checked every 5 min.`);
}

function previewBulkCareer() {
  const raw = document.querySelector("#bulk-career-urls")?.value || "";
  const urls = raw.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
  const preview = document.querySelector("#bulk-preview");
  if (!preview) return;
  if (!urls.length) { preview.textContent = "No URLs pasted."; return; }
  const valid = urls.filter(u => { try { return new URL(u).protocol === "https:"; } catch { return false; } });
  preview.textContent = `${valid.length}/${urls.length} valid HTTPS URLs ready — will appear as careerpage sources.`;
}

async function downloadPackPdf(id) {
  const item = state.applications.find(a => String(a.id) === String(id));
  if (!item?.latex) return toast("No LaTeX found for this pack.");
  try {
    const blob = new Blob([item.latex], { type: "application/x-latex" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${item.company}-${item.title}.tex`.replace(/[^a-z0-9.-]/gi, "_");
    a.click(); URL.revokeObjectURL(url);
    toast("Downloaded .tex — compile to PDF or use the preview.");
  } catch (e) { toast(e.message, { tone: "error" }); }
}

async function copyPackLink(id) {
  const item = state.applications.find(a => String(a.id) === String(id));
  if (!item) return;
  const text = `${item.title} at ${item.company}\nScore: ${item.tailoredScore || item.score}%\nApply: ${item.applyUrl}\n` + (item.coverLetter ? `\nCover letter:\n${item.coverLetter.slice(0,400)}...` : "");
  try {
    await navigator.clipboard.writeText(text);
    toast("Copied pack summary — paste anywhere.");
  } catch {
    downloadText(`${item.company}-pack.txt`, text, "text/plain");
    toast("Copied via download — clipboard not available.");
  }
}

const RESUME_SKILLS = ["sql","python","bigquery","snowflake","databricks","dbt","airflow","spark","etl","gcp","aws","azure","tableau","power bi","looker","looker studio","ga4","google analytics","gam","excel","google sheets","pandas","forecasting","statistics","a/b testing","docker","git","api","data quality","dashboard","reporting","partitioning","clustering"];

async function handleResumeFile(file) {
  const status = document.getElementById("resume-parse-status");
  const previewWrap = document.getElementById("resume-preview");
  const preview = document.getElementById("resume-text-preview");
  if (!status || !previewWrap || !preview) return;
  status.textContent = `Reading ${file.name}...`;
  try {
    let text = "";
    if (file.name.toLowerCase().endsWith(".pdf")) {
      const buf = await file.arrayBuffer();
      const pdf = await (window.pdfjsLib || window.pdfjsLib_global || self.pdfjsLib)?.getDocument({ data: buf, disableWorker: true }).promise;
      if (!pdf) throw new Error("PDF engine not loaded. Try .txt");
      let out = "";
      for (let i = 1; i <= Math.min(pdf.numPages, 3); i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        out += content.items.map(it => it.str).join(" ") + "\n";
      }
      text = out;
    } else {
      text = await file.text();
    }
    if (!text.trim()) throw new Error("No text found in file.");
    preview.value = text.slice(0, 8000);
    previewWrap.style.display = "block";
    const found = RESUME_SKILLS.filter(s => text.toLowerCase().includes(s)).slice(0, 12);
    status.textContent = `Found ${found.length ? found.join(", ") : "no tracked skills"} — edit preview then click "Use this to set my search". This becomes your master for job search.`;
  } catch (e) {
    status.textContent = `Could not read: ${e.message}. Try .txt, .tex or .json.`;
  }
}

async function confirmResumeParse() {
  const text = document.getElementById("resume-text-preview")?.value || "";
  if (!text.trim()) return toast("Paste resume text first.");
  const keepLatex = document.getElementById("keep-latex")?.checked;
  // Extract skills around uploaded resume and set search
  const foundSkills = RESUME_SKILLS.filter(s => text.toLowerCase().includes(s));
  const suggestedSkills = foundSkills.length ? foundSkills.join(",") : String(text.match(/[A-Za-z0-9+#.]{3,}/g)||[]).slice(0,20).join(",");
  state.settings.requiredSkills = foundSkills.join(",") || state.settings.requiredSkills;
  // Try to guess titles: look for "Data Analyst" etc.
  const titleGuess = (text.match(/Data Analyst|BI Analyst|Analytics Engineer|Business Intelligence|Data Engineer|Scientist/gi)||[]).slice(0,3).join(",");
  if (titleGuess) state.settings.alternateTitles = titleGuess;
  saveState();
  // Push to cloud as evidence + profile if remote
  if (remoteEnabled) {
    try {
      // Save as verified evidence (one bulk)
      await api("/evidence", { method: "POST", body: JSON.stringify({ evidenceType: "project", title: "Uploaded Master Resume", details: { name: "Master Resume", tech: foundSkills.slice(0,5).join(", "), bullets: [text.slice(0,500).replace(/\n/g," ").slice(0,400)] }, sourceUrl: "uploaded-resume", confirmed: true }) });
      await api("/profile", { method: "PUT", body: JSON.stringify({ summary: text.slice(0,600), verified_skills: foundSkills }) });
      await connectBackend();
    } catch (e) { /* local only is fine */ }
  }
  // Toggle LaTeX visibility
  document.documentElement.setAttribute("data-keep-latex", keepLatex ? "1" : "0");
  try { localStorage.setItem("applypilot-keep-latex", keepLatex ? "1" : "0"); } catch {}
  toast(`Resume set as master. Search now around: ${foundSkills.slice(0,5).join(", ")||"your profile"}. ${keepLatex ? "LaTeX kept under Advanced." : "LaTeX hidden."}`);
  state.activeView = "today";
  render();
  if (remoteEnabled) { try { await api("/scan", { method: "POST" }); await connectBackend(); } catch {} }
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
  if (state.activeView === "inbox") return runScan();
  if (state.activeView === "today") return runScan();
  if (state.activeView === "internships") return runScan();
  if (state.activeView === "health") return handleAction({ currentTarget: { dataset: { action: "run-evaluation" } } });
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
    state.settings.aiDailyBudget = Number(document.querySelector("#ai-budget").value) || 4;
    state.settings.automationMode = document.querySelector("#automation-mode").value;
    state.settings.autoApplyMinScore = Number(document.querySelector("#auto-score").value) || 88;
    state.settings.approvalMinScore = Number(document.querySelector("#approval-score").value) || 65;
    state.settings.autoApplyDailyLimit = Number(document.querySelector("#auto-limit").value) || 3;
    state.settings.trustedCompanies = document.querySelector("#trusted-companies").value.trim();
    state.settings.blockedCompanies = document.querySelector("#blocked-companies").value.trim();
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
          ,ai_daily_budget: state.settings.aiDailyBudget
          ,feedback_learning_enabled: state.settings.feedbackLearning
          ,automation_mode: state.settings.automationMode
          ,auto_apply_min_score: state.settings.autoApplyMinScore
          ,approval_min_score: state.settings.approvalMinScore
          ,auto_apply_daily_limit: state.settings.autoApplyDailyLimit
          ,trusted_companies: state.settings.trustedCompanies
          ,blocked_companies: state.settings.blockedCompanies
        }) });
      } catch (error) { return toast(error.message); }
    }
    saveState(); toast(remoteEnabled ? "Preferences saved to the cloud." : "Preferences saved on this device.");
    return;
  }
  toast("This action will connect to the hosted backend in the next phase.");
});

document.querySelector("#notifications-button").addEventListener("click", () => {
  const notifications = state.notifications || [];
  dialog.className = "notification-dialog";
  dialog.innerHTML = `<div class="dialog-content"><div class="dialog-header"><div><span class="badge new">ACTIVITY</span><h2>Notifications</h2></div><button class="dialog-close" aria-label="Close">x</button></div><div class="notification-list">${notifications.length ? notifications.map(item => `<article class="${item.read_at ? "read" : ""}"><span class="toast-indicator"></span><div><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.message)}</p><small>${escapeHtml(item.created_at)}</small></div></article>`).join("") : `<div class="empty-state"><h2>All caught up</h2><p>Source failures, new matches, and workflow events will stay here until read.</p></div>`}</div>${notifications.some(item => !item.read_at) ? `<div class="dialog-actions"><button class="primary-button" id="read-all-notifications">Mark all read</button></div>` : ""}</div>`;
  dialog.querySelector(".dialog-close").addEventListener("click", () => dialog.close());
  dialog.querySelector("#read-all-notifications")?.addEventListener("click", async () => { await api("/notifications/read-all", { method: "PUT" }); await connectBackend(); dialog.close(); });
  dialog.showModal();
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
        ,ai_daily_budget: state.settings.aiDailyBudget || 4, feedback_learning_enabled: state.settings.feedbackLearning
        ,automation_mode: state.settings.automationMode || "approval", auto_apply_min_score: state.settings.autoApplyMinScore || 88
        ,approval_min_score: state.settings.approvalMinScore || 65, auto_apply_daily_limit: state.settings.autoApplyDailyLimit || 3
        ,trusted_companies: state.settings.trustedCompanies || "", blocked_companies: state.settings.blockedCompanies || ""
      }) });
    } catch (error) { state.settings.searchPaused = !state.settings.searchPaused; return toast(error.message, { title: "Could not update scans", tone: "error" }); }
  }
  saveState(); render(); toast(state.settings.searchPaused ? "Automatic and manual job scans are paused." : "Job scanning resumed.", { title: state.settings.searchPaused ? "Scans paused" : "Scans resumed" });
});
document.querySelector("#theme-toggle")?.addEventListener("click", () => {
  const current = document.documentElement.getAttribute("data-theme");
  const next = current === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  try { localStorage.setItem("applypilot-theme", next); } catch {}
  document.querySelector("#theme-toggle").textContent = next === "dark" ? "☾" : "◐";
  toast(`Theme: ${next}`, { duration: 1400 });
});
try {
  const savedTheme = localStorage.getItem("applypilot-theme");
  if (savedTheme) document.querySelector("#theme-toggle").textContent = savedTheme === "dark" ? "☾" : "◐";
  else if (window.matchMedia("(prefers-color-scheme: dark)").matches) document.querySelector("#theme-toggle").textContent = "☾";
  const keepLatex = localStorage.getItem("applypilot-keep-latex");
  document.documentElement.setAttribute("data-keep-latex", keepLatex || "1");
} catch {}

document.querySelector("#date-label").textContent = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "short", day: "numeric" }).format(new Date());

if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js"));
const updateOnlineState = () => { document.querySelector("#offline-banner").hidden = navigator.onLine; };
window.addEventListener("online", () => { updateOnlineState(); connectBackend(); });
window.addEventListener("offline", updateOnlineState);
updateOnlineState();
render();
connectBackend();
