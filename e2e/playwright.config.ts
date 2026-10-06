import { defineConfig, devices } from "@playwright/test";

/**
 * Studio in a real browser, over a real project: each test file starts its
 * own Studio from the command line, over its own copy of the fixture
 * project, and drives the pages as a developer does.
 */
export default defineConfig({
  testDir: "./tests",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  ...(process.env.CI && { workers: 2 }),
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI
    ? [
        ["github"],
        ["html", { open: "never", outputFolder: "../node_modules/.cache/courier-e2e/report" }],
      ]
    : "list",
  outputDir: "../node_modules/.cache/courier-e2e/results",
  use: {
    ...devices["Desktop Chrome"],
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
