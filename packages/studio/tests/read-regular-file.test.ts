import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { NotRegularFileError } from "../src/server/not-regular-file-error";
import { readRegularFile } from "../src/server/read-regular-file";
import { makeFedFifo, stopFifoWriters } from "./helpers/make-fed-fifo";

/* Root may read anything, so permission bits cannot refuse it. */
const RUNS_AS_ROOT = process.getuid?.() === 0;
const IS_WINDOWS = process.platform === "win32";
const NOTHING_THROWN = Symbol("nothing thrown");

let dir: string;
let path: string;

function thrownBy(operation: () => unknown): unknown {
  try {
    operation();
  } catch (error) {
    return error;
  }
  return NOTHING_THROWN;
}

beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), "courier-read-regular-")));
  path = join(dir, "courier.mocks.ts");
});

afterEach(() => {
  stopFifoWriters();
  chmodSync(dir, 0o755);
  rmSync(dir, { recursive: true, force: true });
});

describe("readRegularFile", () => {
  it("returns the bytes and the stats of the file it read", () => {
    writeFileSync(path, "export default {};\n");

    const file = readRegularFile(path);

    expect(file?.bytes.toString("utf8")).toBe("export default {};\n");
    expect(file?.stats.ino).toBe(statSync(path).ino);
  });

  /* Windows keeps no POSIX permission bits to read back. */
  it.skipIf(IS_WINDOWS)("returns the permission bits of the file it read", () => {
    writeFileSync(path, "export default {};\n");
    chmodSync(path, 0o640);

    const file = readRegularFile(path);

    expect((file?.stats.mode ?? 0) & 0o7777).toBe(0o640);
  });

  it("returns null when there is nothing at the path", () => {
    expect(readRegularFile(path)).toBeNull();
  });

  it("refuses a symbolic link, even to a regular file", () => {
    writeFileSync(join(dir, "elsewhere.ts"), "export default {};\n");
    symlinkSync(join(dir, "elsewhere.ts"), path);

    const error = thrownBy(() => readRegularFile(path));

    expect(error).toBeInstanceOf(NotRegularFileError);
    expect(error).toMatchObject({
      code: "NOT_REGULAR_FILE",
      path,
      message: `${path} is a symbolic link, not a regular file.`,
    });
    /* The open refuses the link; Windows opens through it, and the name is looked at after. */
    expect(Reflect.get(Object(error), "cause")).toEqual(
      IS_WINDOWS ? undefined : expect.objectContaining({ code: "ELOOP" }),
    );
  });

  it("refuses a directory", () => {
    mkdirSync(path);

    expect(thrownBy(() => readRegularFile(path))).toMatchObject({
      code: "NOT_REGULAR_FILE",
      message: `${path} is a directory, not a regular file.`,
    });
  });

  it.skipIf(IS_WINDOWS)("refuses a FIFO without waiting for a writer", () => {
    makeFedFifo(path, "export default {};\n");

    expect(thrownBy(() => readRegularFile(path))).toMatchObject({
      code: "NOT_REGULAR_FILE",
      message: `${path} is a FIFO, not a regular file.`,
    });
  });

  /* Windows keeps no read permission in a file's mode. */
  it.skipIf(RUNS_AS_ROOT || IS_WINDOWS)("rethrows any other failure to open the file", () => {
    writeFileSync(path, "export default {};\n");
    chmodSync(path, 0o200);

    expect(thrownBy(() => readRegularFile(path))).toMatchObject({ code: "EACCES" });
  });
});
