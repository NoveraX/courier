import { expect, test } from "@playwright/test";

import { importBilling } from "../support/flows";
import { createProject, type Project } from "../support/project";
import { type SpecServer, startSpecServer } from "../support/servers";
import { type Studio, startStudio } from "../support/studio";

test.describe.configure({ mode: "serial" });

let project: Project;
let specs: SpecServer;
let studio: Studio;

const SCHEMAS = "src/api/billing/invoices/schemas.ts";

test.beforeAll(async () => {
  project = createProject("update");
  specs = await startSpecServer();
  studio = await startStudio(project.root);
});

test.afterAll(async () => {
  await studio?.stop();
  await specs?.close();
  project?.remove();
});

test("finds an update, and keeps it found across pages and a reload", async ({ page }) => {
  await page.goto(studio.link);
  await importBilling(page, `${specs.url}/billing.json`);
  specs.publish(2);

  await page.getByRole("button", { name: "Check for updates" }).first().click();
  await expect(page.getByRole("button", { name: "Review update" })).toBeVisible();
  await page.getByRole("link", { name: "Explorer" }).click();
  await page.getByRole("link", { name: "APIs" }).click();
  await expect(page.getByRole("button", { name: "Review update" })).toBeVisible();
  await page.reload();
  await page.getByRole("link", { name: "APIs" }).click();

  await expect(page.getByRole("button", { name: "Review update" })).toBeVisible();
});

test("applies the update: what stays follows the new spec, the dropped endpoint goes", async ({
  page,
}) => {
  expect(project.read(SCHEMAS)).not.toContain("dueDate");
  await page.goto(studio.link);
  await page.getByRole("link", { name: "APIs" }).click();

  await page.getByRole("button", { name: "Review update" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByTitle(/goes with the update/)).toBeVisible();
  await dialog.getByRole("button", { name: "Preview changes" }).click();
  await dialog.getByRole("button", { name: "Apply changes" }).click();

  await expect(dialog).toBeHidden();
  expect(project.read(SCHEMAS)).toContain("dueDate");
  expect(project.read(SCHEMAS)).toContain('"void"');
  expect(project.exists("src/api/billing/customers/index.ts")).toBe(false);
  await expect(page.getByText("Up to date")).toBeVisible();
});
