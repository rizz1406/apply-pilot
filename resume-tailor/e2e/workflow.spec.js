import { expect, test } from "@playwright/test";
import path from "node:path";

test("uploads a structured text resume locally and navigates the workflow", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Resume Tailor" })).toBeVisible();
  await page.locator('input[type="file"][accept*=".txt"]').setInputFiles(path.resolve("sample-resume.txt"));
  await expect(page.getByText("Filled from your resume")).toBeVisible();
  await expect(page.getByLabel("Full name *")).toHaveValue("Jordan Lee");
  await expect(page.getByLabel("Email *")).toHaveValue("jordan.lee@example.com");
  await expect(page.getByLabel("Location")).toHaveValue("Raleigh, NC");
  await page.getByRole("tab", { name: /Applications/ }).click();
  await expect(page.getByText("Application tracker")).toBeVisible();
});

test("reopens a generated result, downloads DOCX, and tracks the application", async ({ page }) => {
  const result = { name: "Jordan Lee", title: "Data Analyst", email: "jordan@example.com", summary: "Analyst", skills: "SQL, Python", matchScore: 75, experienceStructured: [{ role: "Analyst", company: "Acme", dates: "2022-Present", bullets: ["Built reporting dashboards."] }], projectsStructured: [], educationStructured: [], certificationsStructured: [] };
  await page.addInitScript((entry) => localStorage.setItem("resumeTailor.history", JSON.stringify([entry])), { id: "test", label: "Acme — Analyst", person: "Jordan", date: new Date().toISOString(), jd: "Analyst job description with SQL reporting requirements", result, tex: "" });
  await page.goto("/");
  await page.getByRole("tab", { name: /History/ }).click();
  await page.getByRole("button", { name: "Open" }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /Word/ }).click();
  expect((await downloadPromise).suggestedFilename()).toBe("Jordan_Lee.docx");
  await page.getByRole("button", { name: /Track application/ }).click();
  await page.getByRole("tab", { name: /Applications/ }).click();
  await expect(page.getByLabel("Company")).toHaveValue("Acme");
  await expect(page.getByLabel("Role")).toHaveValue("Analyst");
});
