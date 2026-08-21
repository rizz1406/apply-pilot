import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

test("renders the opportunity Inbox without a runtime error", async () => {
  const source = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
  const elements = new Map();
  const makeElement = () => ({
    textContent: "",
    innerHTML: "",
    value: "",
    className: "",
    classList: { add() {}, toggle() {} },
    addEventListener() {},
    append() {},
    close() {},
    remove() {},
    querySelector() { return makeElement(); },
    querySelectorAll() { return []; }
  });
  const element = selector => {
    if (!elements.has(selector)) elements.set(selector, makeElement());
    return elements.get(selector);
  };
  const errors = [];
  const context = {
    Blob,
    Date,
    Intl,
    URL,
    console: { error: (...args) => errors.push(args) },
    document: {
      addEventListener() {},
      createElement: makeElement,
      querySelector: element
    },
    fetch: async () => { throw new Error("offline test"); },
    localStorage: { getItem: key => key === "applypilot-state-v2" ? JSON.stringify({
      jobs: [{ id: "real-job", title: "Data Analyst", company: "Real Company", initials: "RC", color: "#2457d6", location: "India", mode: "Remote", salary: "Salary not listed", source: "Greenhouse", score: 82, status: "new", opportunityType: "full_time", reasons: ["Preferred skills found: SQL", "Experience requirement fits"] }],
      applications: [], outreach: [], activity: []
    }) : null, setItem() {} },
    location: { port: "" },
    navigator: {},
    setTimeout() {},
    structuredClone,
    window: { addEventListener() {}, scrollTo() {} }
  };

  vm.runInNewContext(source, context);
  await Promise.resolve();

  assert.match(element("#app").innerHTML, /1 action needs attention/);
  assert.match(element("#app").innerHTML, /1 strong match/);
  assert.doesNotMatch(element("#app").innerHTML, /This view could not load/);
  assert.equal(errors.length, 0);
});
