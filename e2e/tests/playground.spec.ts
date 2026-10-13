import { expect, test } from "@playwright/test";

import type { Started } from "../support/process";
import { createProject, type Project } from "../support/project";
import { startRuntime } from "../support/runtime";
import { startUpstream, type TestServer } from "../support/servers";
import { type Studio, startStudio } from "../support/studio";

test.describe.configure({ mode: "serial" });

let project: Project;
let upstream: TestServer;
let studio: Studio;
let runtime: Started;

test.beforeAll(async () => {
  project = createProject("playground");
  upstream = await startUpstream();
  studio = await startStudio(project.root, { COURIER_E2E_UPSTREAM: upstream.url });
  runtime = await startRuntime(project.root, studio.env);
});

test.afterAll(async () => {
  await runtime?.stop();
  await studio?.stop();
  await upstream?.close();
  project?.remove();
});

test("sends a call through the app, and shows the upstream's answer", async ({ page }) => {
  await page.goto(studio.link);
  await page.getByRole("link", { name: "Playground" }).click();

  await page.locator("main button").first().click();
  /* Typed before the list's search takes the focus, the keys would reach the
     button that opened it, and Enter would close the list again. */
  await expect(page.getByPlaceholder(/^Search \d+ endpoints/)).toBeFocused();
  await page.keyboard.type("users.list");
  await page.keyboard.press("Enter");
  await expect(page.locator("main button").first()).toContainText("list");
  await page.getByRole("button", { name: /^Send/ }).click();

  const response = page.locator("main");
  await expect(response.getByText("Ada Lovelace").first()).toBeVisible();
  await expect(response.getByText("200").first()).toBeVisible();
});

test("records the call on the Timeline", async ({ page }) => {
  await page.goto(studio.link);

  await page
    .getByRole("link", { name: /Timeline/ })
    .first()
    .click();

  await expect(page.locator("main").getByText("shop.users.list").first()).toBeVisible();
});
