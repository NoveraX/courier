import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NotRegularFileError } from "@noverax/courier-cli/devkit";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { hashFile } from "../src/server/hash-file";
import { makeFedFifo, stopFifoWriters } from "./helpers/make-fed-fifo";

const IS_WINDOWS = process.platform === "win32";
const ABC_DIGEST = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
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
  dir = realpathSync(mkdtempSync(join(tmpdir(), "courier-hash-file-")));
  path = join(dir, "courier.mocks.ts");
});

afterEach(() => {
  stopFifoWriters();
  rmSync(dir, { recursive: true, force: true });
});

describe("hashFile", () => {
  it("returns the digest of the file's bytes", () => {
    writeFileSync(path, "abc");

    expect(hashFile(path)).toBe(ABC_DIGEST);
  });

  it("returns null when there is no file", () => {
    expect(hashFile(path)).toBeNull();
  });

  it.skipIf(IS_WINDOWS)("refuses a symbolic link rather than hashing its target", () => {
    writeFileSync(join(dir, "elsewhere.ts"), "abc");
    symlinkSync(join(dir, "elsewhere.ts"), path);

    const error = thrownBy(() => hashFile(path));

    expect(error).toBeInstanceOf(NotRegularFileError);
    expect(error).toMatchObject({ code: "NOT_REGULAR_FILE", context: { path } });
  });

  it("refuses a directory", () => {
    mkdirSync(path);

    expect(thrownBy(() => hashFile(path))).toBeInstanceOf(NotRegularFileError);
  });

  it.skipIf(IS_WINDOWS)("refuses a FIFO at once, without waiting for a writer", () => {
    makeFedFifo(path, "abc");

    const error = thrownBy(() => hashFile(path));

    expect(error).toBeInstanceOf(NotRegularFileError);
    expect(error).toMatchObject({ message: `${path} is a FIFO, not a regular file.` });
  });
});
