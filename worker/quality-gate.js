export function evaluateApplicationGate(job, settings) {
  const minimum = Number(settings.tailoring_minimum_score || 75);
  const mustHave = String(settings.must_have_skills || "")
    .split(",")
    .map(value => value.trim().toLowerCase())
    .filter(Boolean);
  const text = `${job.title || ""} ${job.description || ""}`.toLowerCase();
  const missingMustHave = mustHave.filter(skill => !text.includes(skill));

  if (!String(job.description || "").trim()) return { allowed: false, error: "A complete job description is required before creating an application pack" };
  if (Number(job.score) < minimum) return { allowed: false, error: `This role scores ${job.score}%. Your tailoring gate is ${minimum}%.` };
  if (missingMustHave.length) return { allowed: false, error: `Missing required skills: ${missingMustHave.join(", ")}` };
  return { allowed: true };
}
