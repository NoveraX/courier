import { defineConfig } from "@playwright/test";

import { browserProjects } from "../support/browsers";
import { APPS } from "./support/apps";
import { targetOf } from "./support/targets";

/**
 * The user's session in an application built with one framework version:
 * `COURIER_FRAMEWORK` names the version, the global setup builds and serves
 * its application, and the checks of its kind drive it in each browser
 * engine — Chromium, WebKit and Firefox, or the ones `COURIER_BROWSERS`
 * names — one after another.
 */
const target = targetOf(process.env.COURIER_FRAMEWORK);

export default defineConfig({
  testDir: "./tests",
  testMatch: APPS[target.app].spec,
  globalSetup: "./support/global-setup.ts",
  /* The application is built once, before the checks, and they share it in order. */
  workers: 1,
  timeout: 60_000,
  globalTimeout: 1_200_000,
  expect: { timeout: 15_000 },
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI
    ? [
        ["github"],
        [
          "html",
          {
            open: "never",
            outputFolder: `../../node_modules/.cache/courier-frameworks/${target.id}/report`,
          },
        ],
      ]
    : "list",
  outputDir: `../../node_modules/.cache/courier-frameworks/${target.id}/results`,
  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: browserProjects(),
});
