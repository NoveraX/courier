import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

import { REPO } from "../../support/project";
import { type RunningApp, runToEnd, startApp } from "../support/app";
import { quickstartTarget } from "../support/targets";

const target = quickstartTarget(process.env.COURIER_QUICKSTART);
const logs = join(REPO, "node_modules/.cache/courier-quickstart", target.id);

const name = `${target.id}-app`;

/* Where the projects are made: the global setup names it, before any test runs. */
function workDir(): string {
  return process.env.COURIER_QUICKSTART_WORK ?? "";
}

let app: RunningApp | undefined;
let created = "";

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  test.setTimeout(900_000);
  mkdirSync(logs, { recursive: true });
  const { status, output } = await runToEnd(
    [
      "npx",
      "--yes",
      "@noverax/create-courier",
      name,
      "--framework",
      target.id,
      "--yes",
      "--no-mcp",
    ],
    workDir(),
    { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" },
    join(logs, "create.log"),
  );
  created = output;
  expect(status, `create-courier failed: see ${join(logs, "create.log")}`).toBe(0);
});

test.afterAll(async () => {
  await app?.stop();
});

test(`${target.id}: the setup type-checks what it added`, () => {
  expect(created).toContain("Courier is set up.");
  expect(created).toContain("The files Courier added type-check against the project's tsconfig.");
});

test(`${target.id}: the project builds for production with Courier in it`, async () => {
  test.setTimeout(600_000);
  const log = join(logs, "build.log");

  const { status } = await runToEnd(
    target.build,
    join(workDir(), name),
    { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0", CI: "1" },
    log,
  );

  expect(status, `${target.build.join(" ")} failed: see ${log}`).toBe(0);
});

test(`${target.id}: the page lists the API's users and creates one`, async ({ page }) => {
  test.setTimeout(900_000);
  app = await startApp(join(workDir(), name), target, process.env, logs);
  await page.goto(`${app.url}${target.page}`);

  await expect(page.getByText("Bob Brown")).toBeVisible();
  await page.getByPlaceholder("Name").fill("Ada Lovelace");
  await page.getByRole("button", { name: "Add user" }).click();

  await expect(page.getByText("ada.lovelace@example.com")).toBeVisible();
});
