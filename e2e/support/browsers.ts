import { devices, type PlaywrightTestConfig } from "@playwright/test";

type Project = NonNullable<PlaywrightTestConfig["projects"]>[number];

/* The engines the checks run in: Chrome's, Safari's and Firefox's, as a person's browser has them. */
const ENGINES = {
  chromium: devices["Desktop Chrome"],
  webkit: devices["Desktop Safari"],
  firefox: devices["Desktop Firefox"],
} as const;

type Engine = keyof typeof ENGINES;

function isEngine(name: string): name is Engine {
  return Object.hasOwn(ENGINES, name);
}

/**
 * The browser engines the checks run in: Chromium, WebKit and Firefox, or
 * the ones `COURIER_BROWSERS` names, comma-separated, in that order.
 *
 * @returns The engines
 * @throws When `COURIER_BROWSERS` names an engine Playwright has not
 * @example
 * ```ts
 * browsers(); // ["chromium", "webkit", "firefox"]
 * ```
 */
export function browsers(): Engine[] {
  const named = (process.env.COURIER_BROWSERS ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
  if (named.length === 0) return ["chromium", "webkit", "firefox"];
  const unknown = named.filter((name) => !isEngine(name));
  if (unknown.length > 0) {
    throw new Error(
      `COURIER_BROWSERS names ${unknown.join(", ")}: it takes chromium, webkit and firefox`,
    );
  }
  return named.filter(isEngine);
}

/**
 * One Playwright project per browser engine the checks run in, each its
 * desktop device with the settings given laid over it.
 *
 * @param use - Settings every engine shares, a viewport say
 * @returns The projects
 * @example
 * ```ts
 * export default defineConfig({ projects: browserProjects({ viewport: { width: 1440, height: 900 } }) });
 * ```
 */
export function browserProjects(use: Project["use"] = {}): Project[] {
  return browsers().map((name) => ({ name, use: { ...ENGINES[name], ...use } }));
}
