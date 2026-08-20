import fs from "node:fs";
import vm from "node:vm";
import { jsPDF } from "jspdf";

const output = new URL("../output/pdf/LaunchDarkly-Data_Analyst-Revenue_Metrics.pdf", import.meta.url);
fs.mkdirSync(new URL("../output/pdf/", import.meta.url), { recursive: true });

const sql = fs.readFileSync(new URL("../migrations/0013_lock_master_resume.sql", import.meta.url), "utf8");
const match = sql.match(/SET profile_json = '(.*)',\r?\n\s+source_name/s);
if (!match) throw new Error("Master resume JSON was not found");
const profile = JSON.parse(match[1].replace(/''/g, "'"));
profile.projects[0].bullets = [
  "Analyzed sales data with SQL and built interactive Power BI views covering revenue, profit, category, monthly, yearly, and regional performance.",
  "Created a 15-day sales forecast with Power BI forecasting tools to support inventory planning."
];
profile.projects[1].bullets = [
  "Cleaned sales data and built Excel pivot tables, charts, and reports across customer demographics, order status, sales channels, and revenue.",
  "Identified key buyer segments, top revenue states and channels, and recommended targeted ads, discounts, and coupons."
];

function TestJsPDF(...args) {
  const document = new jsPDF(...args);
  document.save = () => fs.writeFileSync(output, Buffer.from(document.output("arraybuffer")));
  return document;
}

const makeElement = () => ({
  textContent: "", innerHTML: "", value: "", className: "", hidden: true,
  classList: { add() {}, toggle() {} }, addEventListener() {}, append() {}, close() {}, remove() {},
  querySelector() { return makeElement(); }, querySelectorAll() { return []; }
});
const elements = new Map();
const element = selector => { if (!elements.has(selector)) elements.set(selector, makeElement()); return elements.get(selector); };
const fontFetch = async url => {
  const path = new URL(`../${url}`, import.meta.url);
  return new Response(fs.readFileSync(path), { status: 200 });
};
const context = vm.createContext({
  Blob, Date, Intl, URL, Response, TextEncoder, Uint8Array, structuredClone,
  btoa: value => Buffer.from(value, "binary").toString("base64"),
  console, fetch: fontFetch, location: { port: "" }, navigator: {}, setTimeout() {},
  localStorage: { getItem() { return null; }, setItem() {} },
  document: { addEventListener() {}, createElement: makeElement, querySelector: element },
  window: { addEventListener() {}, scrollTo() {}, jspdf: { jsPDF: TestJsPDF } }
});
context.testItem = {
  company: "LaunchDarkly", title: "Data Analyst - Revenue Metrics",
  tailoredResume: {
    ...profile,
    experienceStructured: profile.experience,
    projectsStructured: profile.projects,
    educationStructured: profile.education,
    certificationsStructured: profile.certifications
  }
};
vm.runInContext(fs.readFileSync(new URL("../app.js", import.meta.url), "utf8"), context);
await vm.runInContext("downloadResumePdf(testItem)", context);
console.log(output.pathname);
