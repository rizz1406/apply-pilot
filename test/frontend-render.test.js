import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

test("renders the Review queue without a runtime error", async () => {
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
    localStorage: { getItem: () => null, setItem() {} },
    location: { port: "" },
    navigator: {},
    setTimeout,
    structuredClone,
    window: { addEventListener() {}, scrollTo() {} }
  };

  vm.runInNewContext(source, context);
  await Promise.resolve();

  assert.match(element("#app").innerHTML, /Review 4 new opportunities/);
  assert.doesNotMatch(element("#app").innerHTML, /This view could not load/);
  assert.equal(errors.length, 0);
});
