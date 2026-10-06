import { expect, type Page, test } from "@playwright/test";

import { createProject, type Project } from "../support/project";
import { type Studio, startStudio } from "../support/studio";

test.describe.configure({ mode: "serial" });

let project: Project;
let studio: Studio;

test.beforeAll(async () => {
  project = createProject("mocks");
  studio = await startStudio(project.root);
});

test.afterAll(async () => {
  await studio?.stop();
  project?.remove();
});

/* What the mock answers, read as the app reads it: status 0 while nothing listens yet. */
async function users(): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`http://127.0.0.1:${studio.mockPort}/users`).catch(() => null);
  if (res === null) return { status: 0, body: null };
  return { status: res.status, body: await res.json().catch(() => null) };
}

async function openMocks(page: Page, tab?: string): Promise<void> {
  await page.goto(studio.link);
  await page.getByRole("link", { name: "Mocks" }).click();
  if (tab) await page.getByRole("link", { name: tab, exact: true }).first().click();
}

test("declares a mock with the wizard, which serves records its schema accepts", async ({
  page,
}) => {
  await openMocks(page);
  await page.getByRole("button", { name: "Generate mocks" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: /^shop/ }).click();
  await dialog.getByRole("button", { name: "Continue" }).click();
  await dialog.getByRole("button", { name: "Review change" }).click();
  /* The project has no mocks file yet, so Studio creates it. */
  await dialog.getByRole("button", { name: "Create courier.mocks.ts" }).click();
  await expect(dialog.getByRole("button", { name: /Done|Close|Open/ }).first()).toBeVisible();

  expect(project.read("courier.mocks.ts")).toContain("shop: defineMockServer(");
  await expect.poll(async () => (await users()).status).toBe(200);
  expect(Array.isArray((await users()).body)).toBe(true);
});

test("adds a record the schema accepts from the Store", async ({ page }) => {
  const before = (await users()).body as unknown[];
  await openMocks(page, "Store");

  await page.getByRole("button", { name: "Add record" }).click();

  await expect.poll(async () => ((await users()).body as unknown[]).length).toBe(before.length + 1);
  const added = ((await users()).body as Array<Record<string, unknown>>).at(-1);
  expect(added?.email).toMatch(/^[^@\s]+@[^@\s]+\.[a-z]+$/);
  expect(["admin", "member", "viewer"]).toContain(added?.role);
});

test("answers as a scenario says, and back as declared", async ({ page }) => {
  await openMocks(page, "Scenarios");
  const empty = page.locator("main").getByText("empty", { exact: true }).first();
  await empty
    .locator("xpath=ancestor::*[.//button][1]")
    .getByRole("button", { name: "Activate" })
    .click();

  await expect.poll(async () => (await users()).body).toEqual([]);
  await page.getByRole("button", { name: "Reset to happy path" }).click();
  await expect.poll(async () => ((await users()).body as unknown[]).length).toBeGreaterThan(0);
});

test("fails every request while the network is down, and recovers", async ({ page }) => {
  await openMocks(page, "Network");

  await page.locator("main").getByText("Down", { exact: true }).first().click();
  await expect.poll(async () => (await users()).status).toBe(503);
  await page.locator("main").getByText("Stable", { exact: true }).first().click();

  await expect.poll(async () => (await users()).status).toBe(200);
});
