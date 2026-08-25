import { jobRiskFlags } from "./application-tools.js";

const list = value => String(value || "").split(",").map(item => item.trim().toLowerCase()).filter(Boolean);
const normalized = value => String(value || "").trim().toLowerCase();

export const providerCapability = (job, env = {}) => {
  const provider = normalized(job.provider);
  if (provider === "recruitee" && env.RECRUITEE_CANDIDATE_SUBMISSION_ENABLED === "true") {
    return { discovery: true, submission: true, mode: "candidate_api", label: "Recruitee candidate API" };
  }
  return {
    discovery: true,
    submission: false,
    mode: "portal_handoff",
    label: provider ? `${provider} portal handoff` : "Official portal handoff"
  };
};

export function classifyApplication(job, settings = {}, env = {}) {
  const score = Number(job.score || 0);
  const autoThreshold = Number(settings.auto_apply_min_score || 88);
  const approvalThreshold = Number(settings.approval_min_score || settings.minimum_match_score || 65);
  const risks = jobRiskFlags({ ...job, applyUrl: job.apply_url || job.applyUrl });
  const company = normalized(job.company);
  const trusted = list(settings.trusted_companies);
  const blocked = list(settings.blocked_companies);
  const capability = providerCapability(job, env);
  const reasons = [];

  if (blocked.some(item => company.includes(item))) {
    return { action: "skip", reasons: ["Company is on your blocked list"], risks, capability };
  }
  if (!String(job.description || "").trim()) {
    return { action: "needs_input", reasons: ["A complete JD is required before tailoring or submission"], risks, capability };
  }
  if (risks.length) return { action: "needs_input", reasons: risks, risks, capability };
  if (score < approvalThreshold) {
    return { action: "skip", reasons: [`${score}% is below your ${approvalThreshold}% review threshold`], risks, capability };
  }

  const trustedCompany = !trusted.length || trusted.some(item => company.includes(item));
  if (score >= autoThreshold && trustedCompany && capability.submission && settings.automation_mode === "auto") {
    reasons.push(`${score}% meets the ${autoThreshold}% automatic threshold`, "Trusted source and candidate submission connector available");
    return { action: "auto_submit", reasons, risks, capability };
  }
  if (score >= autoThreshold && settings.automation_mode === "auto" && !capability.submission) {
    reasons.push(`${score}% qualifies for automatic preparation`, "This provider does not expose a candidate-owned submission API");
    return { action: "approval", reasons, risks, capability, autoPrepare: true };
  }
  reasons.push(`${score}% meets your ${approvalThreshold}% review threshold`);
  if (!trustedCompany) reasons.push("Company is not yet on your trusted auto-apply list");
  return { action: "approval", reasons, risks, capability, autoPrepare: false };
}

export async function persistAutomationDecisions(env, jobs = []) {
  const settings = await env.DB.prepare("SELECT * FROM settings WHERE id=1").first();
  const decisions = jobs.map(job => ({ job, policy: classifyApplication(job, settings, env) }));
  if (decisions.length) await env.DB.batch(decisions.map(({ job, policy }) => env.DB.prepare(`UPDATE jobs
    SET automation_decision=?, automation_reasons=?, automation_capability=?, automation_decided_at=CURRENT_TIMESTAMP
    WHERE id=?`).bind(policy.action, JSON.stringify(policy.reasons), JSON.stringify(policy.capability), job.id)));
  return decisions;
}
