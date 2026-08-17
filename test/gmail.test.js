import test from "node:test";
import assert from "node:assert/strict";
import { extractTrustedLinks } from "../worker/gmail.js";

test("keeps the title attached to each portal job link", () => {
  const links = extractTrustedLinks(`
    <a href="https://www.linkedin.com/jobs/view/111/?trk=email">Data Analyst at Alpha</a>
    <a href="https://www.linkedin.com/jobs/view/222/?trk=email">Junior Data Engineer at Beta</a>
  `);

  assert.deepEqual(links, [
    { provider: "linkedin", url: "https://linkedin.com/jobs/view/111/", label: "Data Analyst at Alpha" },
    { provider: "linkedin", url: "https://linkedin.com/jobs/view/222/", label: "Junior Data Engineer at Beta" }
  ]);
});

test("does not present a generic link label as a job title", () => {
  const [link] = extractTrustedLinks('<a href="https://www.indeed.com/viewjob?jk=abc&from=alert">View job</a>');
  assert.equal(link.label, "");
  assert.equal(link.url, "https://indeed.com/viewjob?jk=abc");
});

test("associates LinkedIn title and canonical URL variants by job id", () => {
  const links = extractTrustedLinks(`
    <a href="https://www.linkedin.com/comm/jobs/view/333?trk=email">BI Analyst at Gamma</a>
    https://www.linkedin.com/jobs/view/333/?refId=alert
  `);
  assert.equal(links[0].label, "BI Analyst at Gamma");
  assert.equal(links[0].url, "https://linkedin.com/jobs/view/333/");
});

test("does not use a Naukri URL as the visible job title", () => {
  const [link] = extractTrustedLinks('https://www.naukri.com/job-listings-software-engineer-accenture-solutions-pvt-ltd-gurugram-3-to-8-years-050826919157');
  assert.equal(link.label, "");
});
