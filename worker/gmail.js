function base64Url(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function accessToken(env) {
  const required = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GMAIL_REFRESH_TOKEN"];
  if (required.some(name => !env[name])) throw new Error("Gmail OAuth is not configured");
  const body = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    refresh_token: env.GMAIL_REFRESH_TOKEN,
    grant_type: "refresh_token"
  });
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  if (!response.ok) throw new Error("Unable to refresh Gmail access token");
  return (await response.json()).access_token;
}

async function gmail(env, path, options = {}) {
  const token = await accessToken(env);
  const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...options.headers }
  });
  if (!response.ok) throw new Error(`Gmail request failed with ${response.status}`);
  return response.json();
}

export async function sendOutreach(env, outreach) {
  if (!outreach.recruiter_email) throw new Error("Recruiter email is required");
  const token = await accessToken(env);
  const mime = [
    `To: ${outreach.recruiter_email}`,
    `Subject: ${outreach.subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "",
    outreach.body
  ].join("\r\n");
  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw: base64Url(mime), threadId: outreach.thread_id || undefined })
  });
  if (!response.ok) throw new Error(`Gmail send failed with ${response.status}`);
  return response.json();
}

export async function sendNotificationEmail(env, recipient, subject, body) {
  if (!recipient) throw new Error("Notification recipient is required");
  const token = await accessToken(env);
  const mime = [
    `To: ${recipient}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "",
    body
  ].join("\r\n");
  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw: base64Url(mime) })
  });
  if (!response.ok) throw new Error(`Gmail notification failed with ${response.status}`);
  return response.json();
}

export async function syncRecruiterReplies(env) {
  const { results } = await env.DB.prepare("SELECT id, thread_id FROM outreach WHERE status = 'sent' AND thread_id IS NOT NULL").all();
  let replies = 0;
  for (const item of results) {
    const thread = await gmail(env, `/threads/${encodeURIComponent(item.thread_id)}?format=metadata&metadataHeaders=From`);
    const hasReply = (thread.messages || []).some(message => (message.labelIds || []).includes("INBOX"));
    if (!hasReply) continue;
    await env.DB.prepare("UPDATE outreach SET status = 'replied', scheduled_for = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(item.id).run();
    await env.DB.prepare("INSERT INTO activity_log (event_type, entity_type, entity_id, message) VALUES ('recruiter_reply', 'outreach', ?, 'Recruiter reply detected; follow-ups stopped')").bind(item.id).run();
    replies += 1;
  }
  return { checked: results.length, replies };
}

export async function syncApplicationConfirmations(env) {
  const { results: applications } = await env.DB.prepare(`SELECT a.id, j.company, j.title
    FROM applications a JOIN jobs j ON j.id = a.job_id
    WHERE a.stage IN ('approved','prepared','applied') AND COALESCE(a.submission_status, 'not_started') != 'confirmed'`).all();
  if (!applications.length) return { checked: 0, confirmed: 0 };

  const after = Math.floor((Date.now() - 14 * 86400000) / 1000);
  const listing = await gmail(env, `/messages?q=${encodeURIComponent(`after:${after} (subject:(application received) OR subject:(application submitted) OR subject:(thank you for applying))`)}&maxResults=50`);
  let confirmed = 0;
  for (const item of listing.messages || []) {
    const message = await gmail(env, `/messages/${encodeURIComponent(item.id)}?format=full`);
    const headers = Object.fromEntries((message.payload?.headers || []).map(header => [header.name.toLowerCase(), header.value]));
    const text = `${headers.subject || ""} ${messageText(message.payload)}`.toLowerCase();
    const confirmation = /application (?:was )?(?:received|submitted)|thank you for applying|thanks for applying/.test(text);
    if (!confirmation) continue;
    const companyCandidates = applications.filter(application => text.includes(application.company.toLowerCase()));
    const candidates = companyCandidates.filter(application => {
      const terms = application.title.toLowerCase().split(/[^a-z0-9]+/).filter(term => term.length >= 4);
      return terms.some(term => text.includes(term));
    });
    const application = candidates.length === 1 ? candidates[0] : (companyCandidates.length === 1 ? companyCandidates[0] : null);
    if (!application) continue;
    const result = await env.DB.prepare(`UPDATE applications SET stage='applied', submission_status='confirmed', confirmation_source='gmail',
      confirmation_confidence=0.98, last_verified_at=CURRENT_TIMESTAMP, submitted_at=COALESCE(submitted_at,CURRENT_TIMESTAMP), updated_at=CURRENT_TIMESTAMP
      WHERE id=? AND COALESCE(submission_status,'not_started') != 'confirmed'`).bind(application.id).run();
    if (!(result.meta.changes || 0)) continue;
    await env.DB.prepare("INSERT INTO activity_log (event_type, entity_type, entity_id, message) VALUES ('application_confirmed', 'application', ?, ?)")
      .bind(application.id, `Application confirmation detected for ${application.title} at ${application.company}`).run();
    await env.DB.prepare("UPDATE application_checklist SET completed = 1, completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE application_id = ? AND item_key = 'confirmation'").bind(application.id).run();
    await env.DB.prepare(`INSERT INTO application_events (id, application_id, event_type, source, confidence, evidence, metadata)
      VALUES (?, ?, 'submission_confirmed', 'gmail', 0.98, ?, ?)`)
      .bind(crypto.randomUUID(), application.id, headers.subject || "Application confirmation email", JSON.stringify({ gmailMessageId: item.id })).run();
    confirmed += 1;
  }
  return { checked: (listing.messages || []).length, confirmed };
}

function decodeBase64Url(value) {
  if (!value) return "";
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
  return new TextDecoder().decode(Uint8Array.from(binary, character => character.charCodeAt(0)));
}

function messageText(part) {
  const own = part?.body?.data ? decodeBase64Url(part.body.data) : "";
  return own + (part?.parts || []).map(messageText).join("\n");
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function cleanLabel(value) {
  return decodeHtml(String(value || "").replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ").trim();
}

function trustedProvider(url) {
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (host.endsWith("linkedin.com") && url.pathname.includes("/jobs/view/")) return "linkedin";
  if (host.endsWith("naukri.com") && url.pathname.includes("job-listings")) return "naukri";
  if (host.endsWith("indeed.com") && url.pathname.includes("viewjob")) return "indeed";
  if (host === "jobs.lever.co") return "lever";
  if (host.endsWith("greenhouse.io")) return "greenhouse";
  if (host === "jobs.ashbyhq.com") return "ashby";
  return null;
}

function providerJobKey(provider, url) {
  if (provider === "linkedin") return url.pathname.match(/\/jobs\/view\/([^/?#]+)/i)?.[1] || "";
  if (provider === "naukri") return url.pathname.match(/job-listings[^/]*\/([^/?#]+)/i)?.[1] || url.pathname;
  if (provider === "indeed") return url.searchParams.get("jk") || "";
  return url.pathname.replace(/\/$/, "");
}

export function extractTrustedLinks(text) {
  const decoded = decodeHtml(text);
  const anchorLabels = new Map();
  for (const match of decoded.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    try {
      const href = decodeHtml(match[1]);
      const label = cleanLabel(match[2]);
      const anchorUrl = new URL(href);
      const provider = trustedProvider(anchorUrl);
      const key = provider && providerJobKey(provider, anchorUrl);
      if (label) anchorLabels.set(href, label);
      if (label && key) anchorLabels.set(`${provider}:${key}`, label);
    } catch {}
  }
  const raw = [...decoded.matchAll(/https?:\/\/[^\s"'<>]+/g)].map(match => match[0].replace(/[),.;]+$/, ""));
  const links = [];
  for (const value of raw) {
    try {
      const url = new URL(value);
      const provider = trustedProvider(url);
      if (!provider) continue;
      const jobKey = providerJobKey(provider, url);
      url.hostname = url.hostname.replace(/^www\./i, "");
      url.hash = "";
      if (provider === "linkedin" && jobKey) url.pathname = `/jobs/view/${jobKey}/`;
      if (provider === "linkedin" || provider === "naukri" || provider === "lever" || provider === "greenhouse" || provider === "ashby") url.search = "";
      if (provider === "indeed") {
        const jobKey = url.searchParams.get("jk");
        url.search = jobKey ? `?jk=${encodeURIComponent(jobKey)}` : "";
      }
      const canonicalUrl = url.toString();
      const rawLabel = anchorLabels.get(value) || anchorLabels.get(decodeHtml(value)) || anchorLabels.get(`${provider}:${jobKey}`) || "";
      const generic = /^(view|open|see|apply|learn|show|check)\b|job alert|unsubscribe|https?:\/\//i.test(rawLabel);
      links.push({ provider, url: canonicalUrl, label: generic ? "" : rawLabel });
    } catch {}
  }
  return [...new Map(links.map(item => [item.url, item])).values()];
}

function leadFallback(link) {
  const url = new URL(link.url);
  if (link.provider === "naukri") {
    const slug = url.pathname.match(/job-listings-([^/?#]+)/i)?.[1] || "";
    const titleSlug = slug.replace(/-\d{8,}.*$/i, "").replace(/-/g, " ").replace(/\s+/g, " ").trim();
    if (titleSlug.length >= 4 && titleSlug.length <= 120) return titleSlug.replace(/\b\w/g, character => character.toUpperCase());
  }
  const pathId = url.pathname.match(/(?:view|job-listings)\/([^/?#]+)/i)?.[1];
  const id = pathId || url.searchParams.get("jk") || "posting";
  const provider = link.provider[0].toUpperCase() + link.provider.slice(1);
  return `${provider} job ${id}`;
}

export async function syncJobAlertEmails(env) {
  const state = await env.DB.prepare("SELECT value FROM integration_state WHERE key = 'job_alert_after'").first();
  const now = Math.floor(Date.now() / 1000);
  const after = Number(state?.value || now - 86400) - 60;
  const query = `after:${after} (from:linkedin.com OR from:naukri.com OR from:indeed.com OR subject:"job alert")`;
  const listing = await gmail(env, `/messages?q=${encodeURIComponent(query)}&maxResults=30`);
  let discovered = 0;

  for (const item of listing.messages || []) {
    const message = await gmail(env, `/messages/${encodeURIComponent(item.id)}?format=full`);
    const headers = Object.fromEntries((message.payload?.headers || []).map(header => [header.name.toLowerCase(), header.value]));
    const links = extractTrustedLinks(messageText(message.payload));
    for (const link of links) {
      const id = `gmail:${item.id}:${await shortHash(link.url)}`;
      const title = link.label || (links.length === 1 ? headers.subject : "") || leadFallback(link);
      const result = await env.DB.prepare("INSERT OR IGNORE INTO job_leads (id, gmail_message_id, provider, subject, url, received_at) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(id, item.id, link.provider, title, link.url, headers.date || null).run();
      discovered += result.meta.changes || 0;
    }
  }

  await env.DB.prepare("INSERT INTO integration_state (key, value) VALUES ('job_alert_after', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP").bind(String(now)).run();
  if (discovered) await env.DB.prepare("INSERT INTO activity_log (event_type, message) VALUES ('job_alert_sync', ?)").bind(`Imported ${discovered} trusted portal job links from Gmail`).run();
  return { messages: (listing.messages || []).length, discovered };
}

async function shortHash(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest).slice(0, 8)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}
