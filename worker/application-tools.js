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
    companyBrief: `Review ${job.company}'s product, recent news, and this role's team context before the interview.`,
    questions: [
      `Walk me through a project where you used ${skills[0] || "data analysis"}.`,
      `How would you approach the main responsibilities in the ${job.title} description?`,
      `Tell me about a data-quality or stakeholder challenge you handled in ${candidate}.`,
      `Which metrics would you use to measure success in this role?`,
      `What questions do you have for the interviewer about the team and expectations?`
    ],
    focusSkills: skills
  };
}
