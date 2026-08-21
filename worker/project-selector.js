const terms = value => new Set(String(value || "").toLowerCase().match(/[a-z][a-z0-9+#.]{2,}/g) || []);

export function selectProjects(job, evidence, limit = 3) {
  const jobTerms = terms(`${job.title || ""} ${job.description || ""}`);
  return (evidence || [])
    .filter(item => item.evidence_type === "project" && item.active && item.verified)
    .map(item => {
      const projectTerms = terms(`${item.title || ""} ${item.context || ""} ${item.bullets || ""}`);
      const overlap = [...projectTerms].filter(term => jobTerms.has(term));
      return { ...item, relevanceScore: Math.min(100, 30 + overlap.length * 12), reason: overlap.length ? `Matches ${overlap.slice(0, 4).join(", ")}` : "Adds verified transferable evidence" };
    })
    .sort((a, b) => b.relevanceScore - a.relevanceScore || String(a.title).localeCompare(String(b.title)))
    .slice(0, limit);
}
