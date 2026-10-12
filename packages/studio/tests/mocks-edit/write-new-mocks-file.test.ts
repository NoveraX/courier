/**
 * Creating the mocks file on real temporary directories. `link` and `unlink`
 * pass through to the file system unless a test makes one call fail, as a
 * file system without hard links or a file held open on Windows would.
 */
import type * as Fs from "node:fs";
import {
  linkSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MocksFileChangedError } from "../../src/server/mocks-edit/mocks-file-changed-error";
import { writeNewMocksFile } from "../../src/server/mocks-edit/write-new-mocks-file";

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof Fs>();
  return {
    ...actual,
    linkSync: vi.fn(actual.linkSync),
    unlinkSync: vi.fn(actual.unlinkSync),
  };
});

const IS_WINDOWS = process.platform === "win32";
const TEMP_FILE = /^\.courier\.mocks\..*\.tmp$/;
const CONTENT = "export default defineMocks({});\n";
const NOTHING_THROWN = Symbol("nothing thrown");

let dir: string;
let path: string;
let previousUmask: number;

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
  dir = realpathSync(mkdtempSync(join(tmpdir(), "courier-new-mocks-")));
  path = join(dir, "courier.mocks.ts");
  previousUmask = process.umask(0o022);
});

afterEach(() => {
  process.umask(previousUmask);
  vi.mocked(linkSync).mockReset();
  vi.mocked(unlinkSync).mockReset();
  vi.restoreAllMocks();
  const leftovers = readdirSync(dir).filter((name) => TEMP_FILE.test(name));
  rmSync(dir, { recursive: true, force: true });
  expect(leftovers).toEqual([]);
});

describe("writeNewMocksFile", () => {
  it("creates the file with its content, leaving nothing behind", () => {
    const leftover = writeNewMocksFile(path, CONTENT);

    expect(leftover).toBeNull();
    expect(readFileSync(path, "utf8")).toBe(CONTENT);
    expect(statSync(path).nlink).toBe(1);
    expect(readdirSync(dir)).toEqual(["courier.mocks.ts"]);
  });

  /* Windows keeps no POSIX permission bits, and no umask shapes them. */
  it.skipIf(IS_WINDOWS).each([
    ["022", 0o022, 0o644],
    ["002", 0o002, 0o664],
    ["077", 0o077, 0o600],
  ])("creates the file with the mode umask %s leaves", (_label, umask, mode) => {
    process.umask(umask);

    writeNewMocksFile(path, CONTENT);

    expect(modeOf(path)).toBe(mode);
  });

  it("refuses when a file of that name appeared meanwhile, and leaves that file as it is", () => {
    writeFileSync(path, "written by the user\n");

    const error = thrownBy(() => writeNewMocksFile(path, CONTENT));

    expect(error).toBeInstanceOf(MocksFileChangedError);
    expect(error).toMatchObject({ code: "MOCKS_FILE_CHANGED", cause: { code: "EEXIST" } });
    expect(readFileSync(path, "utf8")).toBe("written by the user\n");
    expect(readdirSync(dir)).toEqual(["courier.mocks.ts"]);
  });

  it.skipIf(IS_WINDOWS)(
    "refuses a dangling link at the name rather than writing through it",
    () => {
      symlinkSync(join(dir, "gone.ts"), path);

      const error = thrownBy(() => writeNewMocksFile(path, CONTENT));

      expect(error).toBeInstanceOf(MocksFileChangedError);
      expect(readlinkSync(path)).toBe(join(dir, "gone.ts"));
      expect(readdirSync(dir)).toEqual(["courier.mocks.ts"]);
    },
  );

  it("removes its temporary file and rethrows when the file system cannot link", () => {
    const linkError = errnoError("EPERM");
    vi.mocked(linkSync).mockImplementationOnce(() => {
      throw linkError;
    });

    const error = thrownBy(() => writeNewMocksFile(path, CONTENT));

    expect(error).toBe(linkError);
    expect(readdirSync(dir)).toEqual([]);
  });

  it("keeps the created file and returns the temporary file it could not remove", () => {
    const unlinkError = errnoError("EBUSY");
    /* Every time: Windows tries a refused removal again before giving up. */
    vi.mocked(unlinkSync).mockImplementation(() => {
      throw unlinkError;
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const leftover = writeNewMocksFile(path, CONTENT);

    const [tmp] = vi.mocked(linkSync).mock.calls[0] ?? [];
    expect(tmp).toBeDefined();
    expect(leftover).toBe(tmp);
    expect(readFileSync(path, "utf8")).toBe(CONTENT);
    expect(statSync(path).nlink).toBe(2);
    expect(warn).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining(
        `Created ${path}, but ${tmp} is still a second name for it; delete ${tmp}.`,
      ),
      unlinkError,
    );
    vi.mocked(unlinkSync).mockReset();
    unlinkSync(String(tmp));
  });
});
