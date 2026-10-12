import type * as Fs from "node:fs";
import { fsyncSync, mkdtempSync, openSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { syncDirectory } from "../../src/server/project-fs/sync-directory";

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof Fs>();
  return { ...actual, fsyncSync: vi.fn(actual.fsyncSync), openSync: vi.fn(actual.openSync) };
});

const REAL_PLATFORM = process.platform;
const NOTHING_THROWN = Symbol("nothing thrown");

let dir: string;

function thrownBy(operation: () => unknown): unknown {
  try {
    operation();
  } catch (error) {
    return error;
  }
  return NOTHING_THROWN;
}

beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), "courier-sync-dir-")));
});

afterEach(() => {
  Object.defineProperty(process, "platform", {
    value: REAL_PLATFORM,
    configurable: true,
    enumerable: true,
  });
  vi.mocked(fsyncSync).mockReset();
  vi.mocked(openSync).mockReset();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  rmSync(dir, { recursive: true, force: true });
});

describe("syncDirectory", () => {
  it.skipIf(REAL_PLATFORM === "win32")("flushes the directory", () => {
    syncDirectory(dir);

    expect(openSync).toHaveBeenCalledWith(dir, "r");
    expect(fsyncSync).toHaveBeenCalledTimes(1);
  });

  it("logs a flush that fails at debug instead of throwing", () => {
    /* A system that flushes directories, wherever the test runs. */
    Object.defineProperty(process, "platform", {
      value: "linux",
      configurable: true,
      enumerable: true,
    });
    const flushError = Object.assign(new Error("EINVAL: injected"), { code: "EINVAL" });
    vi.mocked(openSync).mockImplementationOnce(() => {
      throw flushError;
    });
    vi.stubEnv("COURIER_LOG_LEVEL", "debug");
    const debug = vi.spyOn(console, "debug").mockImplementation(() => undefined);

    expect(thrownBy(() => syncDirectory(dir))).toBe(NOTHING_THROWN);
    expect(debug).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining(`Could not flush ${dir} after changing a name in it`),
      flushError,
    );
  });

  it("does not try on Windows, which cannot open a directory to flush it", () => {
    Object.defineProperty(process, "platform", {
      value: "win32",
      configurable: true,
      enumerable: true,
    });

    syncDirectory(dir);

    expect(openSync).not.toHaveBeenCalled();
  });
});
