/**
 * The routes in a project's own Vitest, of the version the target
 * installs, through Courier's bundler plugin: a test gets them under Node
 * and under jsdom, where it may import the config itself, and in watch mode
 * an edit to a definition reruns the test that imports them, with the new
 * routes rather than the ones Vitest kept from the run before.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

import { APP_ROOT } from "../support/received";

test.skip(
  ({ browserName }) => browserName !== "chromium",
  "Vitest runs in Node: one engine is enough",
);

/* Vitest's own entry, in the project: one process, which stopping stops. */
const VITEST = ["node_modules/vitest/vitest.mjs"];
const QUIET = { ...process.env, CI: "1", NO_COLOR: "1" };

/* The routes each run of the test saw, in order. */
function seen(): string[] {
  const log = join(APP_ROOT, "seen.log");
  return existsSync(log) ? readFileSync(log, "utf8").trim().split("\n") : [];
}

test("a test gets the routes under Node and under jsdom, beside the config", () => {
  const run = spawnSync(process.execPath, [...VITEST, "run"], {
    cwd: APP_ROOT,
    env: QUIET,
    encoding: "utf8",
  });

  expect(`${run.stdout}${run.stderr}`).toMatch(/Tests\s+2 passed/);
  expect(run.status).toBe(0);
});

test("in watch mode, an edit to a definition reruns the test with the new routes", async () => {
  rmSync(join(APP_ROOT, "seen.log"), { force: true });
  const vitest = spawn(process.execPath, [...VITEST, "--watch", "src/routes.test.ts"], {
    cwd: APP_ROOT,
    env: QUIET,
  });
  const catalog = join(APP_ROOT, "src/catalog.ts");
  const written = readFileSync(catalog, "utf8");
  try {
    await expect.poll(seen, { timeout: 60_000 }).toEqual(["profile"]);

    writeFileSync(
      catalog,
      written.replace('endpoint.get("audit")', 'endpoint.get("audit").expose()'),
    );

    await expect.poll(() => seen().at(-1), { timeout: 60_000 }).toMatch(/audit/);
  } finally {
    writeFileSync(catalog, written);
    vitest.kill();
  }
});
