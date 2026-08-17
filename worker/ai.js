export async function prepareApplication(env, job, settings) {
  if (!env.GEMINI_API_KEY) return deterministicDraft(job, settings);
  const prompt = `You prepare truthful job application materials. Never invent experience. Return strict JSON with keys coverLetter and screeningSummary.\n\nCandidate target role: ${settings.target_role}\nCandidate skills: ${settings.required_skills}\nJob title: ${job.title}\nCompany: ${job.company}\nJob description: ${job.description.slice(0, 12000)}`;
  const model = env.GEMINI_MODEL || "gemini-2.5-flash";
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json", temperature: 0.2 }
    })
  });
  if (!response.ok) return deterministicDraft(job, settings);
  const payload = await response.json();
  try {
    return JSON.parse(payload.candidates?.[0]?.content?.parts?.[0]?.text || "{}");
  } catch {
    return deterministicDraft(job, settings);
  }
}

function deterministicDraft(job, settings) {
  return {
    coverLetter: `Dear ${job.company} hiring team,\n\nI am interested in the ${job.title} position. My background aligns with the role's focus, particularly my experience with ${settings.required_skills}. I would welcome the opportunity to discuss how I could contribute to your team.\n\nSincerely,\nCandidate`,
    screeningSummary: "Review required: generated from the configured skills profile without adding unverified claims."
  };
}
