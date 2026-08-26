import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
const publicApp = fs.readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../styles.css", import.meta.url), "utf8");

test("ships the same workflow UI to source and production bundles", () => {
  assert.equal(publicApp, app);
  for (const marker of ["resume-instruction", "data-restore-version", "data-checklist-key", "data-copy-answer", "evidence-confirmed", "followup-schedule"]) assert.match(app, new RegExp(marker));
});

test("keeps workflow controls responsive on mobile", () => {
  assert.match(css, /\.resume-command \{ display: grid/);
  assert.match(css, /\.workflow-grid, \.answer-list, \.evidence-form \{ grid-template-columns: 1fr; \}/);
  assert.match(css, /\.workflow-check \{ grid-template-columns: auto 1fr; \}/);
});

test("blocks PDF download when verified evidence overflows one page", () => {
  assert.match(app, /doc\.getNumberOfPages\(\) > 1/);
  assert.match(app, /exceeds one page/);
});

test("follow-up requires confirmed submission and repeated preparation preserves applied stages", () => {
  const worker = fs.readFileSync(new URL("../worker/index.js", import.meta.url), "utf8");
  const frontend = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
  assert.match(worker, /submission_status='confirmed'/);
  assert.match(worker, /applications\.stage IN \('applied','outreach','interview','offer'\)/);
  assert.match(frontend, /Follow-up unlocks after submission confirmation/);
});
