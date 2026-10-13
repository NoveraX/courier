/**
 * The modules where the editor finds an endpoint's declaration — and a
 * schema fix edits it — are the project's own files only: one reached
 * through a link that stays in the project is read, one outside is not,
 * and nor is one whose folder became a link to elsewhere while it opened.
 */
import type * as Fs from "node:fs";
import {
  mkdirSync,
  mkdtempSync,
  openSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { sourceModules } from "../../src/server/contract-drift/schema-edit/source-modules";

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof Fs>();
  return { ...actual, openSync: vi.fn(actual.openSync) };
});

let base: string;
let root: string;

beforeEach(() => {
  base = realpathSync(mkdtempSync(join(tmpdir(), "courier-source-modules-")));
  root = join(base, "project");
  mkdirSync(join(root, "src", "api"), { recursive: true });
  mkdirSync(join(base, "outside"));
  writeFileSync(join(root, "src", "api", "shop.ts"), "export const shop = 1;\n");
  writeFileSync(join(base, "outside", "shop.ts"), "export const secret = 1;\n");
});

afterEach(() => {
  vi.mocked(openSync).mockReset();
  rmSync(base, { recursive: true, force: true });
});

describe.skipIf(process.platform === "win32")("sourceModules", () => {
  it("reads a module through a link that stays in the project, and none through one that leads out", () => {
    symlinkSync(join(root, "src", "api"), join(root, "src", "alias"));
    symlinkSync(join(base, "outside"), join(root, "src", "out"));
    const modules = sourceModules(root);

    const inside = modules.imported(join(root, "src", "app.ts"), "./alias/shop");
    const outside = modules.imported(join(root, "src", "app.ts"), "./out/shop");

    expect(inside).toBe(join(root, "src", "api", "shop.ts"));
    expect(modules.module(inside ?? "")?.text).toBe("export const shop = 1;\n");
    expect(outside).toBe(join(base, "outside", "shop.ts"));
    expect(modules.module(outside ?? "")).toBeUndefined();
  });

  it("reads no module whose folder became a link outside after it was resolved", async () => {
    const actual = await vi.importActual<typeof Fs>("node:fs");
    vi.mocked(openSync).mockImplementationOnce((...args: Parameters<typeof actual.openSync>) => {
      renameSync(join(root, "src", "api"), join(root, "src", "api-real"));
      symlinkSync(join(base, "outside"), join(root, "src", "api"));
      return actual.openSync(...args);
    });

    expect(sourceModules(root).module(join(root, "src", "api", "shop.ts"))).toBeUndefined();
  });
});
