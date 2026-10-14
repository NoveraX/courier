import type * as Fs from "node:fs";
import { mkdtempSync, readdirSync, realpathSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { discardTemp } from "../../src/project-fs/discard-temp";

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof Fs>();
  return { ...actual, unlinkSync: vi.fn(actual.unlinkSync) };
});

let dir: string;
let tmp: string;

beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), "courier-discard-temp-")));
  tmp = join(dir, ".courier.mocks.4242-0a1b2c3d.tmp");
  writeFileSync(tmp, "x");
});

afterEach(() => {
  vi.mocked(unlinkSync).mockReset();
  vi.restoreAllMocks();
  rmSync(dir, { recursive: true, force: true });
});

describe("discardTemp", () => {
  it("removes the temporary file", () => {
    expect(discardTemp(tmp)).toBe(true);
    expect(readdirSync(dir)).toEqual([]);
  });

  it("logs a file it cannot remove at warn instead of throwing, and says it is left", () => {
    const unlinkError = Object.assign(new Error("EACCES: injected"), { code: "EACCES" });
    /* Every time: Windows tries a refused removal again before giving up. */
    vi.mocked(unlinkSync).mockImplementation(() => {
      throw unlinkError;
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    expect(discardTemp(tmp)).toBe(false);
    expect(warn).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining(`Could not remove ${tmp}, left by a write that failed; delete it.`),
      unlinkError,
    );
    expect(readdirSync(dir)).toEqual([".courier.mocks.4242-0a1b2c3d.tmp"]);
  });
});
