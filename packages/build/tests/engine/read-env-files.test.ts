/**
 * @vitest-environment node
 *
 * A project's env files, read before its config as the framework's server
 * reads them: the first file to set a variable wins, and the process's own
 * variables win over every file.
 */
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { readEnvFiles } from "../../src/engine/read-env-files";

let dir: string;

beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), "courier-env-files-")));
});

afterEach(() => {
  vi.unstubAllEnvs();
  for (const name of ["SHOP_PUBLIC", "API_URL", "ONLY_IN_ENV"]) delete process.env[name];
  rmSync(dir, { recursive: true, force: true });
});

describe("readEnvFiles", () => {
  it("lets the first file that sets a variable win", () => {
    writeFileSync(join(dir, ".env.production"), "SHOP_PUBLIC=1\n");
    writeFileSync(join(dir, ".env"), "SHOP_PUBLIC=0\nONLY_IN_ENV=yes\n");

    const read = readEnvFiles([join(dir, ".env.production"), join(dir, ".env")]);

    expect(process.env.SHOP_PUBLIC).toBe("1");
    expect(process.env.ONLY_IN_ENV).toBe("yes");
    expect(read).toEqual([join(dir, ".env.production"), join(dir, ".env")]);
  });

  it("keeps a variable the process was started with over every file", () => {
    vi.stubEnv("API_URL", "https://api.example.com");
    writeFileSync(join(dir, ".env"), "API_URL=http://localhost:4000\n");

    readEnvFiles([join(dir, ".env")]);

    expect(process.env.API_URL).toBe("https://api.example.com");
  });

  it("takes the variables the bundler read from the files in place of reading them, the process's still winning", () => {
    vi.stubEnv("API_URL", "https://api.example.com");
    // biome-ignore lint/suspicious/noTemplateCurlyInString: an env file's reference, which the bundler fills in
    writeFileSync(join(dir, ".env"), "SHOP_PUBLIC=${ON}\n");

    readEnvFiles([join(dir, ".env")], { SHOP_PUBLIC: "1", API_URL: "http://localhost:4000" });

    expect(process.env.SHOP_PUBLIC).toBe("1");
    expect(process.env.API_URL).toBe("https://api.example.com");
  });

  it("passes over a file that is not there, reading the rest", () => {
    writeFileSync(join(dir, ".env"), "SHOP_PUBLIC=1\n");

    const read = readEnvFiles([join(dir, ".env.local"), join(dir, ".env")]);

    expect(read).toEqual([join(dir, ".env")]);
    expect(process.env.SHOP_PUBLIC).toBe("1");
  });
});
