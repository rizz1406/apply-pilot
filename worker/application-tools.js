const keywords = text => [...new Set(String(text || "").toLowerCase().match(/sql|python|bigquery|power bi|looker|etl|gcp|ga4|dashboard|data quality|analytics/g) || [])];

export function jobRiskFlags(job) {
  const text = `${job.title || ""} ${job.description || ""}`.toLowerCase();
  const flags = [];
  if (/pay (?:a |an )?fee|registration fee|training fee|deposit/.test(text)) flags.push("Requests payment from candidates");
  if (/whatsapp only|telegram only|personal gmail/.test(text)) flags.push("Unusual recruiting contact language");
  if (job.applyUrl && !String(job.applyUrl).startsWith("https://")) flags.push("Non-HTTPS application URL");
  return flags;
}

export function duplicateKey(job) {
  return `${String(job.company || "").toLowerCase().replace(/[^a-z0-9]/g, "")}:${String(job.title || "").toLowerCase().replace(/[^a-z0-9]/g, "")}`;
}

export function createInterviewPrep(job, profile) {
  const skills = keywords(`${job.title} ${job.description}`).slice(0, 5);
  const candidate = profile?.title || "your experience";
  return {
    companyBrief: `Understand ${job.company}'s product, customers, business model, and the team that owns ${job.title}. Verify current company facts from its official site before the interview.`,
    questions: [
      `Walk me through a project where you used ${skills[0] || "data analysis"}.`,
      `How would you approach the main responsibilities in the ${job.title} description?`,
      `Tell me about a data-quality or stakeholder challenge you handled in ${candidate}.`,
      `Which metrics would you use to measure success in this role?`,
      `What questions do you have for the interviewer about the team and expectations?`
    ],
    focusSkills: skills,
    sqlPractice: [
      "Use a window function to rank monthly performance within each customer segment.",
      "Explain how you would validate a metric when a dashboard and source table disagree.",
      "Describe a partitioning and clustering strategy for a large event table."
    ],
    starPrompts: [
      "A production data-quality issue you diagnosed and resolved",
      "A manual report or pipeline you automated end to end",
      "A disagreement with a stakeholder that you resolved using evidence"
    ],
    plan306090: [
      "30 days: learn definitions, stakeholders, data sources, and release process.",
      "60 days: own a recurring analysis and ship one reliability improvement.",
      "90 days: propose a measurable roadmap based on observed business gaps."
    ],
    interviewerQuestions: [
      "What would excellent performance look like after 90 days?",
      "Which data-quality or reporting problem costs the team the most time today?",
      "How are metric definitions reviewed and governed?"
    ],
    checklist: ["Research company", "Map JD to examples", "Practice SQL", "Prepare STAR stories", "Prepare questions"]
  };
}
