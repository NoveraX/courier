import type * as Crypto from "node:crypto";
import { randomBytes } from "node:crypto";
import type * as Fs from "node:fs";
import {
  fsyncSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MOCKS_TEMP_NAME, writeTempBeside } from "../../src/server/mocks-edit/write-temp-beside";

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof Fs>();
  return { ...actual, fsyncSync: vi.fn(actual.fsyncSync) };
});

vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof Crypto>();
  return { ...actual, randomBytes: vi.fn(actual.randomBytes) };
});

const IS_WINDOWS = process.platform === "win32";
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

beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), "courier-temp-beside-")));
  path = join(dir, "courier.mocks.ts");
  previousUmask = process.umask(0o022);
});

afterEach(() => {
  process.umask(previousUmask);
  vi.mocked(fsyncSync).mockReset();
  vi.mocked(randomBytes).mockReset();
  vi.restoreAllMocks();
  rmSync(dir, { recursive: true, force: true });
});

describe("writeTempBeside", () => {
  it("writes the content beside the file under a name Studio recognizes as its own", () => {
    const tmp = writeTempBeside(path, "export default {};\n", null);

    expect(dirname(tmp)).toBe(dir);
    expect(MOCKS_TEMP_NAME.test(basename(tmp))).toBe(true);
    expect(readFileSync(tmp, "utf8")).toBe("export default {};\n");
  });

  it("gives the file the exact mode asked for, whatever the umask", () => {
    process.umask(0o077);

    const tmp = writeTempBeside(path, "x", 0o664);

    expect(statSync(tmp).mode & 0o7777).toBe(0o664);
  });

  it("gives the file the mode the umask leaves when no mode is asked for", () => {
    const tmp = writeTempBeside(path, "x", null);

    expect(statSync(tmp).mode & 0o7777).toBe(0o644);
  });

  it("removes the file and rethrows when the content cannot be flushed", () => {
    const flushError = Object.assign(new Error("EIO: injected"), { code: "EIO" });
    vi.mocked(fsyncSync).mockImplementationOnce(() => {
      throw flushError;
    });

    expect(thrownBy(() => writeTempBeside(path, "x", null))).toBe(flushError);
    expect(readdirSync(dir)).toEqual([]);
  });

  it.skipIf(IS_WINDOWS)("refuses to write through a link planted at its temporary name", () => {
    const planted = join(dir, "planted.ts");
    writeFileSync(planted, "untouched\n");
    symlinkSync(planted, join(dir, `.courier.mocks.${process.pid}-00000000.tmp`));
    vi.mocked(randomBytes).mockImplementationOnce(() => Buffer.alloc(4));

    const error = thrownBy(() => writeTempBeside(path, "x", null));

    expect(error).toMatchObject({ code: "EEXIST" });
    expect(readFileSync(planted, "utf8")).toBe("untouched\n");
  });
});

describe("MOCKS_TEMP_NAME", () => {
  it("matches the temporary files Studio writes and nothing Studio loads", () => {
    expect(MOCKS_TEMP_NAME.test(".courier.mocks.4242-0a1b2c3d.tmp")).toBe(true);
    expect(MOCKS_TEMP_NAME.test("courier.mocks.ts")).toBe(false);
    expect(MOCKS_TEMP_NAME.test(".courier.mocks.tmp")).toBe(false);
    expect(MOCKS_TEMP_NAME.test(".courier.mocks.4242-0a1b2c3d.tmp.ts")).toBe(false);
  });
});
