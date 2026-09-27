/**
 * Replacing the mocks file on real temporary directories. `rename` and
 * `unlink` pass through to the file system unless a test makes one call
 * fail, as a full disk or a file held open on Windows would.
 */
import { createHash } from "node:crypto";
import type * as Fs from "node:fs";
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MocksFileChangedError } from "../../src/server/mocks-edit/mocks-file-changed-error";
import { replaceMocksFile } from "../../src/server/mocks-edit/replace-mocks-file";
import { makeFedFifo, stopFifoWriters } from "../helpers/make-fed-fifo";

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof Fs>();
  return {
    ...actual,
    renameSync: vi.fn(actual.renameSync),
    unlinkSync: vi.fn(actual.unlinkSync),
  };
});

const REAL_PLATFORM = process.platform;
const IS_WINDOWS = REAL_PLATFORM === "win32";
const TEMP_FILE = /^\.courier\.mocks\..*\.tmp$/;
const NOTHING_THROWN = Symbol("nothing thrown");

let dir: string;
let path: string;
let previousUmask: number;

function sha256(content: string | Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

function thrownBy(operation: () => unknown): unknown {
  try {
    operation();
  } catch (error) {
    return error;
  }
  return NOTHING_THROWN;
}

function errnoError(code: string): Error {
  return Object.assign(new Error(`${code}: injected`), { code });
}

function modeOf(file: string): number {
  return statSync(file).mode & 0o7777;
}

beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), "courier-replace-mocks-")));
  path = join(dir, "courier.mocks.ts");
  previousUmask = process.umask(0o022);
});

afterEach(() => {
  stopFifoWriters();
  process.umask(previousUmask);
  Object.defineProperty(process, "platform", {
    value: REAL_PLATFORM,
    configurable: true,
    enumerable: true,
  });
  vi.mocked(renameSync).mockReset();
  vi.mocked(unlinkSync).mockReset();
  vi.restoreAllMocks();
  const leftovers = readdirSync(dir).filter((name) => TEMP_FILE.test(name));
  rmSync(dir, { recursive: true, force: true });
  expect(leftovers).toEqual([]);
});

describe("replaceMocksFile", () => {
  it("replaces the content exactly and keeps the file's mode 0o664 under umask 022", () => {
    writeFileSync(path, "export default {};\n");
    chmodSync(path, 0o664);
    const content =
      "export default defineMocks({\r\n  shop: defineMockServer({ source: api }),\r\n});\n";

    replaceMocksFile(path, content, { mode: 0o664, expectedHash: sha256("export default {};\n") });

    expect(readFileSync(path, "utf8")).toBe(content);
    expect(modeOf(path)).toBe(0o664);
    expect(readdirSync(dir)).toEqual(["courier.mocks.ts"]);
  });

  it("writes Buffer content byte for byte, byte-order mark included", () => {
    writeFileSync(path, "old\n");
    const bytes = Buffer.from([0xef, 0xbb, 0xbf, ...Buffer.from("export default {}; // é\n")]);

    replaceMocksFile(path, bytes, { mode: 0o644, expectedHash: sha256("old\n") });

    expect(readFileSync(path)).toEqual(bytes);
  });

  it("writes its temporary file beside the target, named for this process", () => {
    writeFileSync(path, "old\n");

    replaceMocksFile(path, "new\n", { mode: 0o644, expectedHash: sha256("old\n") });

    const [tmp, target] = vi.mocked(renameSync).mock.calls[0] ?? [];
    expect(target).toBe(path);
    expect(dirname(String(tmp))).toBe(dir);
    expect(basename(String(tmp))).toMatch(
      new RegExp(`^\\.courier\\.mocks\\.${process.pid}-[0-9a-f]{8}\\.tmp$`),
    );
  });

  it("refuses when the file changed since the edit was planned, and leaves it as it is", () => {
    writeFileSync(path, "old\n");
    const expectedHash = sha256("old\n");
    writeFileSync(path, "edited by the user\n");

    const error = thrownBy(() => replaceMocksFile(path, "new\n", { mode: 0o644, expectedHash }));

    expect(error).toBeInstanceOf(MocksFileChangedError);
    expect(error).toMatchObject({
      code: "MOCKS_FILE_CHANGED",
      message: `${path} changed on disk while Studio was editing it, so Studio left it as it is.`,
    });
    expect(readFileSync(path, "utf8")).toBe("edited by the user\n");
    expect(readdirSync(dir)).toEqual(["courier.mocks.ts"]);
  });

  it("refuses when the file was removed since the edit was planned", () => {
    const error = thrownBy(() =>
      replaceMocksFile(path, "new\n", { mode: 0o644, expectedHash: sha256("old\n") }),
    );

    expect(error).toBeInstanceOf(MocksFileChangedError);
    expect(readdirSync(dir)).toEqual([]);
  });

  it("refuses a directory put at the file's name as a change, and leaves it", () => {
    mkdirSync(path);

    const error = thrownBy(() =>
      replaceMocksFile(path, "new\n", { mode: 0o644, expectedHash: sha256("old\n") }),
    );

    expect(error).toBeInstanceOf(MocksFileChangedError);
    expect(statSync(path).isDirectory()).toBe(true);
    expect(readdirSync(dir)).toEqual(["courier.mocks.ts"]);
  });

  it.skipIf(IS_WINDOWS)(
    "refuses a FIFO put at the file's name without waiting on it, and leaves it",
    () => {
      makeFedFifo(path, "old\n");

      const error = thrownBy(() =>
        replaceMocksFile(path, "new\n", { mode: 0o644, expectedHash: sha256("old\n") }),
      );

      expect(error).toBeInstanceOf(MocksFileChangedError);
      expect(lstatSync(path).isFIFO()).toBe(true);
    },
  );

  it.skipIf(IS_WINDOWS)(
    "refuses a link put at the file's name, even to the same bytes, and leaves the link",
    () => {
      writeFileSync(join(dir, "elsewhere.ts"), "old\n");
      symlinkSync(join(dir, "elsewhere.ts"), path);

      const error = thrownBy(() =>
        replaceMocksFile(path, "new\n", { mode: 0o644, expectedHash: sha256("old\n") }),
      );

      expect(error).toBeInstanceOf(MocksFileChangedError);
      expect(readlinkSync(path)).toBe(join(dir, "elsewhere.ts"));
      expect(readFileSync(join(dir, "elsewhere.ts"), "utf8")).toBe("old\n");
    },
  );

  it("removes its temporary file and rethrows the rename's own error when the rename fails", () => {
    writeFileSync(path, "old\n");
    const renameError = errnoError("EXDEV");
    vi.mocked(renameSync).mockImplementationOnce(() => {
      throw renameError;
    });

    const error = thrownBy(() =>
      replaceMocksFile(path, "new\n", { mode: 0o644, expectedHash: sha256("old\n") }),
    );

    expect(error).toBe(renameError);
    expect(readFileSync(path, "utf8")).toBe("old\n");
    expect(readdirSync(dir)).toEqual(["courier.mocks.ts"]);
  });

  it("logs the temporary file it could not remove at warn, and still throws the original error", () => {
    writeFileSync(path, "old\n");
    const renameError = errnoError("EXDEV");
    const unlinkError = errnoError("EACCES");
    vi.mocked(renameSync).mockImplementationOnce(() => {
      throw renameError;
    });
    vi.mocked(unlinkSync).mockImplementationOnce(() => {
      throw unlinkError;
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const error = thrownBy(() =>
      replaceMocksFile(path, "new\n", { mode: 0o644, expectedHash: sha256("old\n") }),
    );

    const tmp = String(vi.mocked(renameSync).mock.calls[0]?.[0]);
    expect(error).toBe(renameError);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      "%s",
      expect.stringContaining(
        `[Studio] Could not remove ${tmp}, left by a write that failed; delete it.`,
      ),
      unlinkError,
    );
    expect(readdirSync(dir).sort()).toEqual([basename(tmp), "courier.mocks.ts"].sort());
    unlinkSync(tmp);
  });

  it("retries a rename Windows refuses while another process holds the file", () => {
    writeFileSync(path, "old\n");
    Object.defineProperty(process, "platform", {
      value: "win32",
      configurable: true,
      enumerable: true,
    });
    vi.mocked(renameSync).mockImplementationOnce(() => {
      throw errnoError("EBUSY");
    });

    replaceMocksFile(path, "new\n", { mode: 0o644, expectedHash: sha256("old\n") });

    expect(renameSync).toHaveBeenCalledTimes(2);
    expect(readFileSync(path, "utf8")).toBe("new\n");
  });
});
