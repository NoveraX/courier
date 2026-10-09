import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

import { REPO } from "../../support/project";
import { type RunningApp, runToEnd, startApp } from "../support/app";
import { quickstartTarget } from "../support/targets";

const target = quickstartTarget(process.env.COURIER_QUICKSTART);
const logs = join(REPO, "node_modules/.cache/courier-quickstart", target.id);

let app: RunningApp | undefined;
let created = "";

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  test.setTimeout(900_000);
  const work = process.env.COURIER_QUICKSTART_WORK ?? "";
  mkdirSync(logs, { recursive: true });
  const name = `${target.id}-app`;
  const { status, output } = await runToEnd(
    [
      "npx",
      "--yes",
      "@noverax/create-courier@latest",
      name,
      "--framework",
      target.id,
      "--yes",
      "--no-mcp",
    ],
    work,
    { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" },
    join(logs, "create.log"),
  );
  created = output;
  expect(status, `create-courier failed: see ${join(logs, "create.log")}`).toBe(0);
  app = await startApp(join(work, name), target, process.env, logs);
});

test.afterAll(async () => {
  await app?.stop();
});

test(`${target.id}: the setup type-checks what it added`, () => {
  expect(created).toContain("Courier is set up.");
  expect(created).toContain("The files Courier added type-check against the project's tsconfig.");
});

test(`${target.id}: the page lists the API's users and creates one`, async ({ page }) => {
  await page.goto(`${app?.url}${target.page}`);

  await expect(page.getByText("Bob Brown")).toBeVisible();
  await page.getByPlaceholder("Name").fill("Ada Lovelace");
  await page.getByRole("button", { name: "Add user" }).click();

  await expect(page.getByText("ada.lovelace@example.com")).toBeVisible();
});
