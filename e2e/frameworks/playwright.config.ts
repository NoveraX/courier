import { defineConfig } from "@playwright/test";

import { browserProjects } from "../support/browsers";
import { APPS } from "./support/apps";
import { targetOf } from "./support/targets";

/**
 * The user's session in an application built with one framework version:
 * `COURIER_FRAMEWORK` names the version, the global setup builds and serves
 * its application, and the checks of its kind drive it in each browser
 * engine — Chromium, WebKit and Firefox, or the ones `COURIER_BROWSERS`
 * names — one after another. An application built with Courier's bundler
 * plugin is driven by the checks of its routes too; with
 * `COURIER_FRAMEWORK_MODE=dev`, by those alone, under its dev server.
 */
const target = targetOf(process.env.COURIER_FRAMEWORK);
const app = APPS[target.app];
const underDev = process.env.COURIER_FRAMEWORK_MODE === "dev";
const runId = underDev ? `${target.id}-dev` : target.id;

/* The checks that drive the application: under its dev server, the routes' alone. */
function checks(): string[] {
  if (underDev) return app.dev === undefined ? [] : ["routes.spec.ts"];
  return [
    app.spec,
    ...(app.routesPage === undefined ? [] : ["routes.spec.ts"]),
    ...(target.bundle === undefined ? [] : ["bundle.spec.ts"]),
  ];
}

const testMatch = checks();

export default defineConfig({
  testDir: "./tests",
  testMatch,
  /* Nothing is built or served for a version with nothing to check. */
  ...(testMatch.length > 0 && { globalSetup: "./support/global-setup.ts" }),
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
            outputFolder: `../../node_modules/.cache/courier-frameworks/${runId}/report`,
          },
        ],
      ]
    : "list",
  outputDir: `../../node_modules/.cache/courier-frameworks/${runId}/results`,
  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: browserProjects(),
});
