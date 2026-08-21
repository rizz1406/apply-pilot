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

test("reads JobPosting JSON-LD from an official career page", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(`<html><script type="application/ld+json">${JSON.stringify({ "@type": "JobPosting", identifier: { value: "J1" }, title: "Analytics Engineer", description: "<p>dbt and SQL</p>", datePosted: "2026-08-21", url: "https://acme.example/careers/J1", hiringOrganization: { name: "Acme" }, jobLocation: { address: { addressLocality: "Hyderabad", addressCountry: "India" } } })}</script></html>`, { headers: { "content-type": "text/html" } });
  try {
    const jobs = await fetchSource({ provider: "careerpage", organization: "https://acme.example/careers", label: "Acme" });
    assert.equal(jobs[0].provider, "careerpage");
    assert.equal(jobs[0].description, "dbt and SQL");
  } finally { globalThis.fetch = originalFetch; }
});
