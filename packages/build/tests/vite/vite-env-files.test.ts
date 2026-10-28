/**
 * @vitest-environment node
 *
 * The env files the routes are read with: those Vite reads for the mode,
 * in the order the first to set a variable wins.
 */
import { describe, expect, it } from "vitest";

import { viteEnvFiles } from "../../src/vite/vite-env-files";

describe("viteEnvFiles", () => {
  it("lists the mode's local file, the mode's, the local one and .env, the first winning", () => {
    expect(viteEnvFiles({ root: "/app", mode: "production" })).toEqual([
      "/app/.env.production.local",
      "/app/.env.production",
      "/app/.env.local",
      "/app/.env",
    ]);
  });

  it("reads them from the folder Vite's envDir names", () => {
    expect(viteEnvFiles({ root: "/app", mode: "development", envDir: "/app/env" })[3]).toBe(
      "/app/env/.env",
    );
  });

  it("reads none when Vite's envDir turns env files off", () => {
    expect(viteEnvFiles({ root: "/app", mode: "production", envDir: false })).toEqual([]);
  });
});
