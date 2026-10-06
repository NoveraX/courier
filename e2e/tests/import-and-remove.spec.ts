import { expect, test } from "@playwright/test";

import { importBilling } from "../support/flows";
import { createProject, type Project } from "../support/project";
import { type SpecServer, startSpecServer } from "../support/servers";
import { type Studio, startStudio } from "../support/studio";

test.describe.configure({ mode: "serial" });

let project: Project;
let specs: SpecServer;
let studio: Studio;

test.beforeAll(async () => {
  project = createProject("import");
  specs = await startSpecServer();
  studio = await startStudio(project.root);
});

test.afterAll(async () => {
  await studio?.stop();
  await specs?.close();
  project?.remove();
});

test("imports an API from its URL and declares it in courier.config.ts", async ({ page }) => {
  await page.goto(studio.link);

  await importBilling(page, `${specs.url}/billing.json`);

  expect(project.read("courier.config.ts")).toContain('from "./src/api/billing/source"');
  expect(project.exists("src/api/billing/source.ts")).toBe(true);
  await expect(page.getByRole("button", { name: "Remove billing" })).toBeVisible();
});

test("removes it, taking it out of courier.config.ts first", async ({ page }) => {
  const declared = project.read("courier.config.ts");
  await page.goto(studio.link);
  await page.getByRole("link", { name: "APIs" }).click();

  await page.getByRole("button", { name: "Remove billing" }).click();
  const dialog = page.getByRole("dialog");
  const box = dialog.getByRole("checkbox", { name: "Also remove billing from courier.config.ts" });
  await expect(box).toBeChecked();
  await dialog.getByRole("button", { name: "Remove", exact: true }).click();

  await expect(dialog).toBeHidden();
  expect(declared).toContain("billing");
  expect(project.read("courier.config.ts")).not.toContain("billing");
  expect(project.exists("src/api/billing/source.ts")).toBe(false);
  await expect(page.getByRole("button", { name: "Remove billing" })).toBeHidden();
});
