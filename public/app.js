const STORAGE_KEY = "applypilot-demo-state-v1";
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
  jobs: [
    { id: 1, title: "Data Analyst - Digital Analytics", company: "Northstar Media", initials: "NM", color: "#2457d6", location: "Hyderabad", mode: "Hybrid", salary: "Salary not listed", source: "Greenhouse", score: 94, age: "18 min ago", status: "new", reasons: ["BigQuery, GA4, and SQL are core requirements", "Digital media experience matches", "Seniority aligns with 1+ year experience"] },
    { id: 2, title: "Business Intelligence Analyst", company: "Linearworks", initials: "LW", color: "#6d4ec7", location: "Remote - India", mode: "Remote", salary: "Salary not listed", source: "Lever", score: 90, age: "1 hr ago", status: "new", reasons: ["Power BI and SQL overlap strongly", "ETL ownership is relevant", "Remote India matches your location"] },
    { id: 3, title: "AdTech Data Analyst", company: "Harbor Digital", initials: "HD", color: "#0f766e", location: "Bengaluru", mode: "Hybrid", salary: "Salary not listed", source: "Career page", score: 88, age: "3 hr ago", status: "new", reasons: ["GAM and ad-performance experience are uncommon direct matches", "BigQuery reporting is required", "Location needs your review"] },
    { id: 4, title: "Junior Analytics Engineer", company: "Mosaic Labs", initials: "ML", color: "#b45309", location: "Remote - India", mode: "Remote", salary: "Salary not listed", source: "Gmail alert", score: 79, age: "Yesterday", status: "new", reasons: ["Bronze/Silver/Gold SQL experience is relevant", "ETL and data QA match", "Data modeling depth needs review"] }
  ],
  applications: [
    { id: 11, title: "Reporting Analyst", company: "Brightwell", stage: "applied", updated: "Today", score: 91 },
    { id: 12, title: "BI Analyst", company: "Relay", stage: "outreach", updated: "Yesterday", score: 88 },
    { id: 13, title: "Digital Analytics Analyst", company: "Archway", stage: "interview", updated: "Mon", score: 86 },
    { id: 14, title: "Data Analyst", company: "Daybreak", stage: "closed", updated: "Aug 11", score: 81 }
  ],
  outreach: [
    { id: 21, name: "Maya Chen", company: "Brightwell", role: "Reporting Analyst", status: "due", label: "Follow-up due", timing: "Today" },
    { id: 22, name: "Jordan Lee", company: "Relay", role: "BI Analyst", status: "draft", label: "Draft ready", timing: "Review" },
    { id: 23, name: "Priya Shah", company: "Archway", role: "Digital Analytics Analyst", status: "sent", label: "Replied", timing: "2 days ago" }
  ],
  activity: [
    { text: "Interview invitation detected from Archway", time: "12 minutes ago" },
    { text: "4 new roles passed your eligibility rules", time: "38 minutes ago" },
    { text: "Application confirmation saved for Brightwell", time: "2 hours ago" },
    { text: "Follow-up prepared for Maya Chen", time: "Yesterday" }
  ],
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
  const stageMap = { approved: "prepared", prepared: "prepared", applied: "applied", outreach: "outreach", interview: "interview", offer: "interview", rejected: "closed", withdrawn: "closed" };
  state.applications = data.applications.map(item => ({ id: item.id, title: item.title, company: item.company, stage: stageMap[item.stage] || "prepared", updated: item.updated_at, submittedAt: item.submitted_at, score: item.score, applyUrl: item.apply_url, rawStage: item.stage,
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
      ,experienceToleranceYears: data.settings.experience_tolerance_years ?? 1
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
    if (!quiet) toast(`Backend unavailable: ${error.message}`);
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
    today: state.jobs.filter(job => job.status === "new" && job.opportunityType !== "internship").length,
    internships: state.jobs.filter(job => job.status === "new" && job.opportunityType === "internship").length,
    pipeline: state.applications.filter(item => item.stage !== "closed").length,
    outreach: state.outreach.filter(item => item.status !== "sent").length,
    settings: ""
  };
}

function renderNav() {
  const totals = counts();
  const markup = navItems.map(item => `
    <button class="nav-button ${state.activeView === item.id ? "active" : ""}" data-view="${item.id}">
      <span class="nav-glyph" aria-hidden="true">${item.glyph}</span>
      <span>${item.label}</span>
      <span class="nav-count">${totals[item.id]}</span>
    </button>`).join("");
  document.querySelector(".desktop-nav").innerHTML = markup;
  document.querySelector(".mobile-nav").innerHTML = markup;
}

function render() {
  const titles = { today: "Review jobs", internships: "Early Career & Internships", pipeline: "Application pipeline", outreach: "Recruiter outreach", settings: "Preferences" };
  document.querySelector("#page-title").textContent = titles[state.activeView];
  const initials = state.profile.fullName.split(/\s+/).map(part => part[0]).join("").slice(0, 2).toUpperCase();
  document.querySelector(".sidebar-profile .avatar").textContent = initials;
  document.querySelector(".sidebar-profile strong").textContent = state.profile.fullName;
  document.querySelector(".sidebar-profile small").textContent = state.profile.currentTitle;
  const action = document.querySelector("#demo-action");
  action.textContent = state.activeView === "today" || state.activeView === "internships" ? "Run job scan" : state.activeView === "settings" ? "Save changes" : "Add item";
  renderNav();
  if (state.activeView === "today") renderToday();
  if (state.activeView === "internships") renderInternships();
  if (state.activeView === "pipeline") renderPipeline();
  if (state.activeView === "outreach") renderOutreach();
  if (state.activeView === "settings") renderSettings();
  bindViewEvents();
}

function renderToday() {
  const available = state.jobs.filter(job => job.status === "new" && job.opportunityType !== "internship");
  const reviewTotal = available.length;
  const activeApps = state.applications.filter(item => item.stage !== "closed").length;
  const interviews = state.applications.filter(item => ["interview", "offer"].includes(item.rawStage || item.stage)).length;
  const followupsReady = state.outreach.filter(item => item.status === "draft" || item.status === "approved").length;
  const reviewed = Math.max(0, state.jobs.length + portalAlerts - reviewTotal);
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
      ${metric("Scored matches", available.length, available.length ? "Ready to review" : "None yet")}
      ${metric("Official sources", state.sources.filter(source => source.enabled !== 0).length, "Full JD scanning")}
      ${metric("Active applications", activeApps, activeApps ? "Tracked in pipeline" : "None started")}
      ${metric("Follow-ups ready", followupsReady, followupsReady ? "Approve and send" : "None waiting")}
    </section>
    <div class="content-grid">
      <section>
        <div class="section-heading"><div><h2>Recommended for you</h2><p>${remoteEnabled ? "Live records from your configured sources" : "Demo records until the cloud backend is connected"}</p></div><button class="text-button" data-action="${remoteEnabled ? "scan" : "reset"}">${remoteEnabled ? "Refresh sources" : "Reset demo"}</button></div>
        <div class="job-list">
          ${available.length ? available.map(jobCard).join("") : `<div class="empty-state"><h2>Review queue complete</h2><p>You handled every current match. Run another scan or reset the demo to restore sample jobs.</p><button class="primary-button" data-action="scan">Run job scan</button></div>`}
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

function jobCard(job) {
  const skillReason = job.reasons.find(reason => /preferred skills found/i.test(reason)) || "Skill overlap needs JD review";
  const experienceReason = job.reasons.find(reason => /experience requirement|seniority/i.test(reason)) || "Experience level checked";
  const fitLabel = job.score >= 90 ? "Strong match" : job.score >= 75 ? "Good match" : "Eligible match";
  return `<article class="job-card" data-job-id="${job.id}">
    <div class="company-logo" style="background:${job.color}">${job.initials}</div>
    <div>
      <div class="match-summary"><strong>${job.score}% ${fitLabel}</strong><span>${escapeHtml(skillReason)}</span><span>${escapeHtml(experienceReason)}</span></div><div class="job-title-row"><h3 class="job-title">${job.title}</h3><span class="badge new">READY TO APPLY</span></div>
      <p class="job-company">${job.company}</p>${job.riskFlags?.length ? `<p class="risk-note">Review: ${escapeHtml(job.riskFlags.join("; "))}</p>` : ""}
      <div class="job-meta"><span>${job.location}</span><span>${job.mode}</span><span>${job.salary}</span><span>${job.source}</span></div>
    </div>
    <div class="score-block"><div class="score">${job.score}%</div><div class="score-label">MATCH</div></div>
    <div class="job-actions">
      <button class="secondary-button" data-action="skip" data-id="${job.id}">Skip</button>
      <button class="secondary-button" data-action="details" data-id="${job.id}">Review</button>
      <button class="primary-button" data-action="approve" data-id="${job.id}">Prepare application</button>
    </div>
  </article>`;
}

function renderInternships() {
  const internships = state.jobs.filter(job => job.status === "new" && job.opportunityType === "internship");
  app.innerHTML = `<section class="focus-strip"><div class="focus-copy"><span>Official early-career roles</span><h2>${internships.length ? `${internships.length} internship opportunit${internships.length === 1 ? "y" : "ies"}` : "No internship opportunities yet"}</h2><p>This queue is broader than full-time matching. It keeps India/remote roles so you can compare pay and transferable skills.</p></div></section><div class="section-heading"><div><h2>Early Career & Internships</h2><p>Automatically scored official company postings with pay, skills, timing, and a short summary.</p></div><button class="text-button" data-action="scan">Refresh sources</button></div><div class="internship-list">${internships.length ? internships.map(internshipCard).join("") : `<div class="empty-state"><h2>Queue is clear</h2><p>The agent is monitoring your official company sources for India and remote internships. New roles are scored before they appear here.</p><button class="primary-button" data-action="scan">Run job scan</button></div>`}</div>`;
}

function internshipCard(job) {
  const skillPool = String(state.settings.requiredSkills || "").split(",").map(skill => skill.trim()).filter(Boolean);
  const skills = skillPool.filter(skill => String(job.description || "").toLowerCase().includes(skill.toLowerCase())).slice(0, 4);
  const timing = job.age ? new Intl.DateTimeFormat("en", { day: "numeric", month: "short" }).format(new Date(job.age)) : "Posting date not listed";
  const pay = job.salary && job.salary !== "Salary not listed" ? job.salary : "Pay not listed";
  const summary = `${job.title} at ${job.company}. ${skills.length ? `The JD mentions ${skills.join(", ")}.` : "Review the JD for transferable skills."} ${pay === "Pay not listed" ? "Compensation is not disclosed." : `Compensation listed: ${pay}.`}`;
  return `<article class="internship-card"><div class="internship-head"><div><span class="lead-provider">${escapeHtml(job.source)} | OFFICIAL BOARD</span><h3>${escapeHtml(job.title)}</h3><p>${escapeHtml(job.company)} | ${escapeHtml(job.location)}</p></div><strong>${job.score}% fit</strong></div><div class="internship-facts"><span><small>Pay</small>${escapeHtml(pay)}</span><span><small>Posted</small>${escapeHtml(timing)}</span><span><small>Top skills</small>${escapeHtml(skills.join(", ") || "Review JD")}</span></div><div class="internship-actions"><button class="secondary-button" data-action="toggle-intern-summary" data-id="${escapeHtml(job.id)}">Quick summary</button><button class="secondary-button" data-action="details" data-id="${escapeHtml(job.id)}">Review</button><button class="primary-button" data-action="approve" data-id="${escapeHtml(job.id)}">Prepare application</button></div><p class="internship-summary" id="intern-summary-${escapeHtml(job.id)}" hidden>${escapeHtml(summary)}</p></article>`;
}

function renderPipeline() {
  const stages = [
    { id: "prepared", label: "Prepared" }, { id: "applied", label: "Applied" }, { id: "outreach", label: "Outreach" },
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
      <div class="field"><label for="freshness">Maximum posting age (hours)</label><input id="freshness" type="number" min="1" max="720" value="${s.freshnessHours || 72}"></div>
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
  if (action === "approve") approveJob(id);
  if (action === "skip") updateJob(id, "skipped", "Job skipped and removed from your queue");
  if (action === "details") showJob(id);
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
  dialog.className = "pack-modal";
  dialog.innerHTML = `<div class="dialog-content pack-dialog"><div class="dialog-header"><div><span class="badge new">${item.tailoredScore || 0}% TAILORED</span><h2>${escapeHtml(item.title)}</h2><p class="job-company">${escapeHtml(item.company)} · ${escapeHtml(item.tailoredStatus || "review")}</p></div><button class="dialog-close" aria-label="Close">x</button></div>
    <div class="pack-grid"><section><h3>ATS coverage</h3><strong class="pack-score">${coverage.pct ?? "-"}%</strong><p class="job-company">Matched: ${escapeHtml((coverage.matched || []).join(", ") || "No tracked keywords")}</p><p class="job-company">Missing: ${escapeHtml((coverage.missing || []).join(", ") || "None")}</p></section><section><h3>Truth audit</h3><strong>${escapeHtml(audit.verdict || "review")}</strong><p class="job-company">${Number(audit.autoCorrected || 0)} grounded corrections applied</p><p class="job-company">${escapeHtml((audit.qualityIssues || []).join(" ") || "No quality issues detected")}</p></section></div>
    <div class="match-reasons"><h3>Tailored summary</h3><p>${escapeHtml(item.tailoredResume.summary)}</p><h3>Prioritized skills</h3><p>${escapeHtml(item.tailoredResume.skills)}</p></div>
    <div class="match-reasons"><h3>Cover letter</h3><p class="prewrap">${escapeHtml(item.coverLetter || "Not generated")}</p></div>
    <div class="dialog-actions"><button class="secondary-button" id="download-json">Resume JSON</button><button class="secondary-button" id="download-tex">LaTeX</button><button class="secondary-button" id="download-pdf">Save as PDF</button><button class="secondary-button" id="open-application">Open application</button><button class="secondary-button" id="mark-applied">Mark applied</button><button class="primary-button" id="approve-tailored">Approve resume</button></div>
    <button class="text-button pack-followup" id="prepare-interview">Create interview workspace</button>
    <button class="text-button pack-followup" id="create-followup">Create recruiter follow-up</button></div>`;
  dialog.showModal();
  dialog.querySelector(".dialog-close").onclick = () => dialog.close();
  dialog.querySelector("#download-json").onclick = () => downloadText(`${item.company}-${item.title}.json`.replace(/[^a-z0-9.-]+/gi, "_"), JSON.stringify(item.tailoredResume, null, 2), "application/json");
  dialog.querySelector("#download-tex").onclick = () => downloadText(`${item.company}-${item.title}.tex`.replace(/[^a-z0-9.-]+/gi, "_"), item.latex || "", "application/x-latex");
  dialog.querySelector("#download-pdf").onclick = () => printResumePdf(item);
  dialog.querySelector("#open-application").onclick = () => window.open(item.applyUrl, "_blank", "noopener,noreferrer");
  dialog.querySelector("#mark-applied").onclick = async () => {
    try { await api(`/applications/${encodeURIComponent(item.id)}/stage`, { method: "PUT", body: JSON.stringify({ stage: "applied" }) }); dialog.close(); await connectBackend(); toast("Application marked as applied."); }
    catch (error) { toast(error.message); }
  };
  dialog.querySelector("#approve-tailored").onclick = async () => {
    try { await api(`/tailored-resumes/${encodeURIComponent(item.tailoredResumeId)}/approve`, { method: "POST" }); dialog.close(); await connectBackend(); toast("Job-specific resume approved."); }
    catch (error) { toast(error.message); }
  };
  dialog.querySelector("#create-followup").onclick = () => showFollowupComposer(item);
  dialog.querySelector("#prepare-interview").onclick = () => createInterviewWorkspace(item);
}

function printResumePdf(item) {
  const resume = item.tailoredResume;
  const popup = window.open("", "_blank", "noopener,noreferrer");
  if (!popup) return toast("Allow popups to save the PDF.");
  popup.document.write(`<!doctype html><title>${escapeHtml(item.title)} resume</title><style>body{font-family:Arial,sans-serif;max-width:760px;margin:36px auto;line-height:1.45;color:#111}h1{margin-bottom:0}h2{border-bottom:1px solid #bbb;padding-bottom:4px;margin-top:26px}p{white-space:pre-wrap}</style><h1>${escapeHtml(resume.name || state.profile.fullName)}</h1><p>${escapeHtml(resume.title || item.title)}</p><h2>Summary</h2><p>${escapeHtml(resume.summary || "")}</p><h2>Skills</h2><p>${escapeHtml(resume.skills || "")}</p><h2>Experience</h2><p>${escapeHtml(JSON.stringify(resume.experience || [], null, 2))}</p>`);
  popup.document.close(); popup.focus(); setTimeout(() => popup.print(), 250);
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
  if (remoteEnabled) {
    try {
      await api(`/jobs/${encodeURIComponent(id)}/decision`, { method: "POST", body: JSON.stringify({ decision: "approved" }) });
      await connectBackend();
      return toast(`${job.company} approved. A truthful application draft was prepared.`);
    } catch (error) { return toast(error.message); }
  }
  job.status = "approved";
  state.applications.unshift({ id: Date.now(), title: job.title, company: job.company, stage: "applied", updated: "Just now", score: job.score });
  state.activity.unshift({ text: `Application pack prepared for ${job.company}`, time: "Just now" });
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
    <div class="match-reasons"><h3>Why this matches</h3><ul>${job.reasons.map(reason => `<li>${reason}</li>`).join("")}</ul></div>
    <p class="job-company">The production agent will show the complete job description, eligibility checks, tailored resume preview and screening answers here.</p>
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
  if (remoteEnabled) {
    try {
      const result = await api("/scan", { method: "POST" });
      await connectBackend();
      const skipped = result.skipped || {};
      const exclusions = [
        ["too old", skipped.stale], ["location", skipped.location], ["experience", skipped.experience],
        ["salary", skipped.salary], ["low fit", skipped.lowFit]
      ].filter(([, count]) => count).map(([label, count]) => `${count} ${label}`).join(", ");
      return toast(`Checked ${result.considered || 0} postings across ${result.scanned} official sources. ${result.discovered} new matches.${exclusions ? ` Excluded: ${exclusions}.` : ""}`);
    } catch (error) { return toast(error.message); }
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

function toast(message) {
  const node = document.createElement("div");
  node.className = "toast";
  node.textContent = message;
  document.querySelector("#toast-region").append(node);
  setTimeout(() => node.remove(), 3200);
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
    state.settings.freshnessHours = Number(document.querySelector("#freshness").value) || 72;
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
        }) });
      } catch (error) { return toast(error.message); }
    }
    saveState(); toast(remoteEnabled ? "Preferences saved to the cloud." : "Preferences saved on this device.");
    return;
  }
  toast("This action will connect to the hosted backend in the next phase.");
});

document.querySelector("#notifications-button").addEventListener("click", () => {
  const pending = state.jobs.filter(job => job.status === "new").length + state.leads.length;
  const replies = state.outreach.filter(item => item.status === "sent").length;
  toast(pending || replies ? `${pending} opportunities need review; ${replies} recruiter threads are active.` : "No new notifications.");
});
document.querySelector("#date-label").textContent = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "short", day: "numeric" }).format(new Date());

if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js"));
render();
connectBackend();
