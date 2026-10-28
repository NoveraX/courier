/**
 * @vitest-environment node
 *
 * The variables of Vite's env files, with the values Vite gives them:
 * references to other variables and their defaults filled in, the mode's
 * files first, and a variable the process was started with left to the
 * process.
 */
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { viteEnvValues } from "../../src/vite/vite-env-values";

let dir: string;

beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), "courier-vite-env-values-")));
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(dir, { recursive: true, force: true });
});

describe("viteEnvValues", () => {
  it("fills in a reference to another variable, and a default, as Vite does, the mode's file winning", () => {
    writeFileSync(
      join(dir, ".env"),
      // biome-ignore lint/suspicious/noTemplateCurlyInString: an env file's references, which Vite fills in
      "HOST=api.internal\nAPI_URL=https://${HOST}/v1\nEXPOSE_ADMIN=${FEATURE_ADMIN:-1}\n",
    );
    writeFileSync(join(dir, ".env.staging"), "HOST=staging.internal\n");

    expect(viteEnvValues({ root: dir, mode: "staging" })).toMatchObject({
      HOST: "staging.internal",
      API_URL: "https://staging.internal/v1",
      EXPOSE_ADMIN: "1",
    });
  });

  it("leaves a variable the process was started with to the process", () => {
    vi.stubEnv("HOST", "from-the-process");
    writeFileSync(join(dir, ".env"), "HOST=api.internal\n");

    expect(viteEnvValues({ root: dir, mode: "development" })).not.toHaveProperty("HOST");
  });

  it("gives none when Vite's env folder is turned off", () => {
    writeFileSync(join(dir, ".env"), "HOST=api.internal\n");

    expect(viteEnvValues({ root: dir, mode: "development", envDir: false })).toEqual({});
  });
});
