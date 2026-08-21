const STOP_WORDS = new Set(["and", "the", "for", "with", "from", "this", "that", "role", "data", "job", "india", "remote"]);

const normalized = value => String(value || "").toLowerCase().replace(/[^a-z0-9+#. ]/g, " ").replace(/\s+/g, " ").trim();

export function feedbackFeatures(job) {
  const features = new Set();
  const provider = normalized(job.provider);
  const company = normalized(job.company);
  if (provider) features.add(`provider:${provider}`);
  if (company) features.add(`company:${company}`);
  for (const token of normalized(job.title).split(" ")) {
    if (token.length >= 3 && !STOP_WORDS.has(token)) features.add(`title:${token}`);
  }
  return [...features].slice(0, 12);
}

export function feedbackAdjustment(job, weights = {}) {
  const matched = feedbackFeatures(job).map(key => ({ key, weight: Number(weights[key] || 0) })).filter(item => item.weight);
  const adjustment = Math.max(-12, Math.min(12, matched.reduce((sum, item) => sum + item.weight, 0)));
  return { adjustment, features: matched };
}

export async function rebuildPreferenceWeights(db) {
  const { results } = await db.prepare(`SELECT f.relevance, j.provider, j.company, j.title
    FROM job_feedback f JOIN jobs j ON j.id = f.job_id`).all();
  const totals = new Map();
  for (const row of results) {
    for (const feature of feedbackFeatures(row)) {
      const value = totals.get(feature) || { positive: 0, negative: 0 };
      if (row.relevance > 0) value.positive += 1;
      else value.negative += 1;
      totals.set(feature, value);
    }
  }
  await db.prepare("DELETE FROM preference_weights").run();
  if (totals.size) {
    await db.batch([...totals].map(([key, value]) => db.prepare(`INSERT INTO preference_weights
      (feature_key, positive_count, negative_count, weight) VALUES (?, ?, ?, ?)`)
      .bind(key, value.positive, value.negative, Math.max(-6, Math.min(6, (value.positive - value.negative) * 2)))));
  }
  return Object.fromEntries([...totals].map(([key, value]) => [key, Math.max(-6, Math.min(6, (value.positive - value.negative) * 2))]));
}
