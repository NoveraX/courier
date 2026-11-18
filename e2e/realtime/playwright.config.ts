import { defineConfig } from "@playwright/test";

import { browserProjects } from "../support/browsers";

/**
 * A page's realtime connection in a real browser, over the built packages:
 * each way the entry in front of the server treats a WebSocket gets its own
 * replica, entry and page, and the checks drive the page's connections in
 * Chromium, WebKit and Firefox, or the engines `COURIER_BROWSERS` names,
 * one engine after another.
 */
export default defineConfig({
  testDir: "./tests",
  /* The root's paths point the packages at their sources; this one's leave them built, as an application has them. */
  tsconfig: "../../tsconfig.base.json",
  /* One page at a time: a busy runner would hold its answers past what the checks wait for. */
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  outputDir: "../../node_modules/.cache/courier-e2e/realtime",
  use: { trace: "retain-on-failure" },
  projects: browserProjects(),
});
