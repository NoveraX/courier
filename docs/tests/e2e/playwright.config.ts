import { defineConfig, devices } from "@playwright/test"

/* The engines the examples run in: Chromium alone unless `COURIER_BROWSERS` names others, as the
   repository's own e2e reads it. */
const ENGINES = {
  chromium: devices["Desktop Chrome"],
  webkit: devices["Desktop Safari"],
  firefox: devices["Desktop Firefox"],
} as const

function engines(): Array<keyof typeof ENGINES> {
  const named = (process.env.COURIER_BROWSERS ?? "chromium")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean)
  const unknown = named.filter((name) => !Object.hasOwn(ENGINES, name))
  if (unknown.length > 0) {
    throw new Error(
      `COURIER_BROWSERS names ${unknown.join(", ")}: it takes chromium, webkit and firefox`
    )
  }
  return named.filter((name): name is keyof typeof ENGINES => Object.hasOwn(ENGINES, name))
}

/**
 * Every live example, driven in a browser on the site's production
 * server — `npm run build` first — opened by a name that is not localhost,
 * over HTTPS, through a front that stands where the site's CDN does. With
 * `SITE_URL`, the same examples run against that deployed site instead.
 */
export default defineConfig({
  testDir: ".",
  testMatch: "*.spec.ts",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  outputDir: "../../node_modules/.cache/courier-site-examples/results",
  globalSetup: "./support/global-setup.ts",
  use: { trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: engines().map((name) => ({ name, use: ENGINES[name] })),
})
