const normalizeList = value => String(value || "")
  .split(",")
  .map(item => item.trim().toLowerCase())
  .filter(Boolean);

export function scoreJob(job, settings) {
  const title = String(job.title || "").toLowerCase();
  const description = String(job.description || "").toLowerCase();
  const location = String(job.location || "").toLowerCase();
  const text = `${title} ${description}`;
  const titles = normalizeList(`${settings.target_role},${settings.alternate_titles}`);
  const skills = normalizeList(settings.required_skills);
  const locations = normalizeList(settings.preferred_locations);
  const excluded = normalizeList(settings.excluded_keywords);
  const seniorTitleKeywords = ["senior", "lead", "principal", "staff", "manager", "director", "head of", "architect"];
  const disclosedSalaryMax = extractSalaryMaximum(job.salaryText);
  const workplace = `${location} ${job.workplaceType || job.workplace_type || ""}`.toLowerCase();
  const locationIsOpen = locations.some(value => ["any", "anywhere"].includes(value));
  const indiaWide = locations.some(value => ["india", "india-wide"].includes(value));
  const indiaAliases = /\b(?:india|hyderabad|hyd\b|secunderabad|bengaluru|bangalore|blr\b|pune|mumbai|bombay|delhi|ncr|gurugram|gurgaon|noida|chennai|kolkata|ahmedabad|kochi|jaipur|indore|lucknow|coimbatore|bhubaneswar|remote india|india-remote)\b/.test(location);
  const indiaLocation = indiaAliases;
  const remoteAllowed = locationIsOpen || indiaWide || locations.some(value => value.includes("remote"));
  const isRemote = /\b(?:remote|work from home|wfh|hybrid|distributed)\b/.test(workplace);
  const remoteLocationEligible = remoteAllowed && isRemote && (!location || location.includes("india") || location.includes("global") || location.includes("worldwide") || !location.trim());

  if (excluded.some(keyword => text.includes(keyword))) {
    return { score: 0, eligible: false, reasons: ["Contains an excluded keyword"] };
  }
  const seniorKeyword = seniorTitleKeywords.find(keyword => title.includes(keyword));
  const seniorTitleAllowed = seniorKeyword && titles.some(value => value.includes(seniorKeyword) && (title.includes(value) || value.includes(title)));
  if (seniorKeyword && !seniorTitleAllowed) {
    return { score: 0, eligible: false, reasons: ["Seniority is above the configured target level"] };
  }
  if (settings.minimum_salary && disclosedSalaryMax && disclosedSalaryMax < Number(settings.minimum_salary)) {
    return { score: 0, eligible: false, reasons: ["Published salary is below the configured minimum"] };
  }
  const experienceMinimum = extractExperienceMinimum(job.description);
  const experienceTolerance = Number(settings.experience_tolerance_years ?? 1);
  if (settings.candidate_years && experienceMinimum && experienceMinimum > Number(settings.candidate_years) + experienceTolerance) {
    return { score: 0, eligible: false, reasons: [`Requires at least ${experienceMinimum} years of experience`] };
  }

  const titleMatches = titles.filter(value => title.includes(value) || value.includes(title));
  const skillMatches = skills.filter(value => text.includes(value));
  const locationMatch = locationIsOpen || (indiaWide && indiaLocation) || locations.some(value => !value.includes("remote") && !["india", "india-wide"].includes(value) && location.includes(value)) || remoteLocationEligible;
  if (location && !locationMatch) {
    return { score: 0, eligible: false, reasons: ["Location conflicts with the no-relocation preference"] };
  }

  let score = titleMatches.length ? 40 : 12;
  score += Math.min(35, titleMatches.length * 25);
  score += skills.length ? Math.round((skillMatches.length / skills.length) * 20) : 10;
  score += locationMatch ? 10 : 0;
  if (!titleMatches.length && skillMatches.length < 4) score -= 10;
  score = Math.max(0, Math.min(100, score));

  const reasons = [];
  if (titleMatches.length) reasons.push(`Title matches ${titleMatches[0]}`);
  if (skillMatches.length) reasons.push(`${skillMatches.length} preferred skills found`);
  if (locationMatch) reasons.push("Location preference matches");
  if (!locationMatch) reasons.push("Location needs review");
  if (disclosedSalaryMax && settings.minimum_salary) reasons.push("Published salary clears the minimum");
  if (experienceMinimum) reasons.push(`Experience requirement starts at ${experienceMinimum} years`);

  const dimensions = {
    title: titleMatches.length ? 100 : 0,
    skills: skills.length ? Math.round((skillMatches.length / skills.length) * 100) : 50,
    location: locationMatch ? 100 : 40,
    salary: disclosedSalaryMax ? (disclosedSalaryMax >= Number(settings.minimum_salary || 0) ? 100 : 0) : 50,
    experience: experienceMinimum ? (experienceMinimum <= Number(settings.candidate_years || 0) + 1 ? 100 : 0) : 50
  };
  return { score, eligible: score >= Number(settings.minimum_match_score || 55), reasons, dimensions };
}

export function extractExperienceMinimum(value) {
  const text = String(value || "").toLowerCase();
  if (/\bfresher\b|\bentry[ -]?level\b|\b0\s*year|\bno experience\b/.test(text)) return 0;
  const matches = [...text.matchAll(/(\d+)\s*(?:\+|\-\s*\d+)?\s*years?(?:\s+of)?\s+(?:relevant\s+)?experience/g)].map(match => Number(match[1]));
  const alt = [...text.matchAll(/(?:experience|exp\.?)\s*[:\-]?\s*(\d+)\s*\+?\s*(?:years?|yrs?)/g)].map(m => Number(m[1]));
  const all = [...matches, ...alt];
  return all.length ? Math.min(...all) : null;
}

export function extractSalaryMaximum(value) {
  const text = String(value || "").toLowerCase().replace(/,/g, "");
  const lpa = [...text.matchAll(/(\d+(?:\.\d+)?)\s*(?:lpa|lakhs?|lac)/g)].map(match => Number(match[1]) * 100000);
  if (lpa.length) return Math.max(...lpa);
  const ctc = [...text.matchAll(/ctc\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*(?:lpa)?/g)].map(m => Number(m[1]) * (Number(m[1]) < 100 ? 100000 : 1));
  if (ctc.length) return Math.max(...ctc);
  const rupees = [...text.matchAll(/(?:₹|inr|rs\.?)[\s]*(\d{5,8})/g)].map(match => Number(match[1]));
  if (rupees.length) return Math.max(...rupees);
  const usd = [...text.matchAll(/\$\s*(\d{3,6})\b/g)].map(m => Number(m[1]) * 83000);
  if (usd.length) return Math.max(...usd);
  const hourly = [...text.matchAll(/(\d{2,4})\s*(?:\/\s*hour|\/hr|per hour|hourly)/g)].map(m => Number(m[1]) * 2080 * 83);
  if (hourly.length) return Math.max(...hourly);
  return null;
}

export function formatSalaryForDisplay(salaryText) {
  if (!salaryText || salaryText === "Salary not listed") return "Salary not listed";
  return String(salaryText).trim();
}

export function stripHtml(value) {
  return String(value || "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    // Decode common entities before stripping tags
    .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&#\d+;/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}
