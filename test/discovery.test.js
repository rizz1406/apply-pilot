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
