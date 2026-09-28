import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { readStudioToken } from "../src/runtime/read-studio-token";

const TOKEN = "Zx9_".repeat(11).slice(0, 43);
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function project(token?: string): string {
  const root = mkdtempSync(join(tmpdir(), "studio-token-"));
  roots.push(root);
  if (token !== undefined) {
    mkdirSync(join(root, ".courier"));
    writeFileSync(join(root, ".courier", "studio-token"), `${token}\n`, { mode: 0o600 });
  }
  return root;
}

/**
 * The token a server runtime presents to Studio is the one Studio wrote into
 * the project's `.courier`: nothing else passes for it.
 */
describe("readStudioToken", () => {
  it("reads the token Studio wrote beside courier.config", () => {
    expect(readStudioToken(project(TOKEN))).toBe(TOKEN);
  });

  it("finds none before Studio has run on the project", () => {
    expect(readStudioToken(project())).toBeUndefined();
  });

  it("finds none in a file that does not hold a token Studio writes", () => {
    expect(readStudioToken(project("not a token"))).toBeUndefined();
  });

  it("finds none where the name is a folder, not a file", () => {
    const root = project();
    mkdirSync(join(root, ".courier", "studio-token"), { recursive: true });

    expect(readStudioToken(root)).toBeUndefined();
  });

  it.skipIf(process.getuid?.() === 0 || process.platform === "win32")(
    "finds none, and says so once, where the file cannot be read",
    () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const root = project(TOKEN);
      chmodSync(join(root, ".courier", "studio-token"), 0o000);

      expect(readStudioToken(root)).toBeUndefined();
      expect(readStudioToken(root)).toBeUndefined();
      expect(warn).toHaveBeenCalledTimes(1);
    },
  );
});
