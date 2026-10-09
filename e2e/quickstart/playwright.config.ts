import { defineConfig, devices } from "@playwright/test";

import { quickstartTarget } from "./support/targets";

/**
 * The one-command setup, as a person meets it: `COURIER_QUICKSTART` names
 * the framework, the global setup serves Courier's packages as a
 * registry, and the check creates a project with
 * `npx @noverax/create-courier@latest`, starts Studio and the app, and
 * uses the page the setup added, in Chromium.
 */
const target = quickstartTarget(process.env.COURIER_QUICKSTART);

export default defineConfig({
  testDir: "./tests",
  globalSetup: "./support/global-setup.ts",
  workers: 1,
  /* Creating a project downloads its framework and installs it, which takes minutes. */
  timeout: 900_000,
  globalTimeout: 1_500_000,
  expect: { timeout: 30_000 },
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  outputDir: `../../node_modules/.cache/courier-quickstart/${target.id}/results`,
  use: { trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
