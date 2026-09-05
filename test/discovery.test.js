import test from "node:test";
import assert from "node:assert/strict";
import { fetchSource } from "../worker/discovery.js";

test("maps an Ashby public job board response", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ jobs: [{ id: "a1", title: "Data Analyst", location: "Remote - India", isRemote: true, descriptionHtml: "<p>SQL and BigQuery</p>", applyUrl: "https://jobs.ashbyhq.com/acme/a1", publishedAt: "2026-08-17T00:00:00Z" }] }));
  try {
    const jobs = await fetchSource({ provider: "ashby", organization: "acme", label: "Acme" });
    assert.equal(jobs[0].provider, "ashby");
    assert.equal(jobs[0].description, "SQL and BigQuery");
  } finally { globalThis.fetch = originalFetch; }
});

test("maps a SmartRecruiters public posting", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => new Response(JSON.stringify(String(url).includes("?limit=") ? { content: [{ id: "s1" }] } : {
    id: "s1", name: "BI Analyst", location: { city: "Hyderabad", country: "in" },
    jobAd: { sections: { jobDescription: { text: "<p>Power BI and SQL</p>" } } },
    applyUrl: "https://jobs.smartrecruiters.com/acme/s1"
  }));
  try {
    const jobs = await fetchSource({ provider: "smartrecruiters", organization: "acme", label: "Acme" });
    assert.equal(jobs[0].title, "BI Analyst");
    assert.match(jobs[0].description, /Power BI/);
  } finally { globalThis.fetch = originalFetch; }
});

test("maps a Workable public posting", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ results: [{ shortcode: "W1", title: "Data Analyst", city: "Hyderabad", country: "India", description: "<p>SQL and dashboards</p>", url: "https://apply.workable.com/acme/j/W1/" }] }));
  try {
    const jobs = await fetchSource({ provider: "workable", organization: "acme", label: "Acme" });
    assert.equal(jobs[0].provider, "workable");
    assert.equal(jobs[0].location, "Hyderabad, India");
  } finally { globalThis.fetch = originalFetch; }
});

test("maps a Recruitee public offer", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ offers: [{ id: 7, title: "BI Analyst", location: "Remote India", description: "SQL", careers_url: "https://acme.recruitee.com/o/bi-analyst" }] }));
  try {
    const jobs = await fetchSource({ provider: "recruitee", organization: "acme", label: "Acme" });
    assert.equal(jobs[0].title, "BI Analyst");
    assert.match(jobs[0].applyUrl, /recruitee/);
  } finally { globalThis.fetch = originalFetch; }
});

test("maps a Remote OK public API listing", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify([
    { legal: "API Terms of Service" },
    { id: "r1", company: "Acme Remote", position: "Data Analyst", location: "", description: "<p>SQL and BigQuery</p>", url: "https://remoteok.com/remote-jobs/r1", salary_min: 60000, salary_max: 90000, date: "2026-08-30T00:00:00Z" }
  ]));
  try {
    const jobs = await fetchSource({ provider: "remoteok", organization: "", label: "Remote OK" });
    assert.equal(jobs.length, 1);
    assert.equal(jobs[0].title, "Data Analyst");
    assert.equal(jobs[0].workplaceType, "Remote");
    assert.match(jobs[0].description, /SQL and BigQuery/);
    assert.match(jobs[0].salaryText, /60000/);
  } finally { globalThis.fetch = originalFetch; }
});

test("maps a We Work Remotely RSS listing", async () => {
  const originalFetch = globalThis.fetch;
  const rss = `<?xml version="1.0"?><rss><channel>
    <item><title>Acme Inc: Senior Data Analyst</title><link>https://weworkremotely.com/remote-jobs/acme-senior-data-analyst</link><region>Anywhere in the World</region><description>SQL and dashboards</description><pubDate>Mon, 17 Aug 2026 00:00:00 +0000</pubDate></item>
  </channel></rss>`;
  globalThis.fetch = async () => new Response(rss, { headers: { "content-type": "application/xml" } });
  try {
    const jobs = await fetchSource({ provider: "weworkremotely", organization: "", label: "We Work Remotely" });
    assert.equal(jobs[0].company, "Acme Inc");
    assert.equal(jobs[0].title, "Senior Data Analyst");
    assert.equal(jobs[0].workplaceType, "Remote");
    assert.match(jobs[0].applyUrl, /weworkremotely/);
  } finally { globalThis.fetch = originalFetch; }
});

test("reads JobPosting JSON-LD from an official career page", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(`<html><script type="application/ld+json">${JSON.stringify({ "@type": "JobPosting", identifier: { value: "J1" }, title: "Analytics Engineer", description: "<p>dbt and SQL</p>", datePosted: "2026-08-21", url: "https://acme.example/careers/J1", hiringOrganization: { name: "Acme" }, jobLocation: { address: { addressLocality: "Hyderabad", addressCountry: "India" } } })}</script></html>`, { headers: { "content-type": "text/html" } });
  try {
    const jobs = await fetchSource({ provider: "careerpage", organization: "https://acme.example/careers", label: "Acme" });
    assert.equal(jobs[0].provider, "careerpage");
    assert.equal(jobs[0].description, "dbt and SQL");
  } finally { globalThis.fetch = originalFetch; }
});
