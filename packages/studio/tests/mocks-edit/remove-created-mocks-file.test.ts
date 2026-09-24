import { createHash } from "node:crypto";
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { MocksFileChangedError } from "../../src/server/mocks-edit/mocks-file-changed-error";
import { removeCreatedMocksFile } from "../../src/server/mocks-edit/remove-created-mocks-file";
import { makeFedFifo, stopFifoWriters } from "../helpers/make-fed-fifo";

const IS_WINDOWS = process.platform === "win32";
const CONTENT = "export default defineMocks({});\n";
const NOTHING_THROWN = Symbol("nothing thrown");

let dir: string;
let path: string;

function sha256(content: string): string {
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

beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), "courier-remove-mocks-")));
  path = join(dir, "courier.mocks.ts");
});

afterEach(() => {
  stopFifoWriters();
  rmSync(dir, { recursive: true, force: true });
});

describe("removeCreatedMocksFile", () => {
  it("removes the file while it is exactly what Studio wrote", () => {
    writeFileSync(path, CONTENT);

    removeCreatedMocksFile(path, sha256(CONTENT));

    expect(readdirSync(dir)).toEqual([]);
  });

  it("refuses a file changed since Studio wrote it, and leaves it", () => {
    writeFileSync(path, "export default defineMocks({ edited: true });\n");

    const error = thrownBy(() => removeCreatedMocksFile(path, sha256(CONTENT)));

    expect(error).toBeInstanceOf(MocksFileChangedError);
    expect(readFileSync(path, "utf8")).toBe("export default defineMocks({ edited: true });\n");
  });

  it("refuses when the file is already gone", () => {
    const error = thrownBy(() => removeCreatedMocksFile(path, sha256(CONTENT)));

    expect(error).toBeInstanceOf(MocksFileChangedError);
  });

  it("refuses a directory put at the file's name, and leaves it", () => {
    mkdirSync(path);

    const error = thrownBy(() => removeCreatedMocksFile(path, sha256(CONTENT)));

    expect(error).toBeInstanceOf(MocksFileChangedError);
    expect(lstatSync(path).isDirectory()).toBe(true);
  });

  it.skipIf(IS_WINDOWS)(
    "refuses a FIFO put at the file's name without waiting on it, and leaves it",
    () => {
      makeFedFifo(path, CONTENT);

      const error = thrownBy(() => removeCreatedMocksFile(path, sha256(CONTENT)));

      expect(error).toBeInstanceOf(MocksFileChangedError);
      expect(lstatSync(path).isFIFO()).toBe(true);
    },
  );

  it.skipIf(IS_WINDOWS)(
    "refuses a link put at the file's name, even to the same bytes, and leaves the link",
    () => {
      writeFileSync(join(dir, "elsewhere.ts"), CONTENT);
      symlinkSync(join(dir, "elsewhere.ts"), path);

      const error = thrownBy(() => removeCreatedMocksFile(path, sha256(CONTENT)));

      expect(error).toBeInstanceOf(MocksFileChangedError);
      expect(readlinkSync(path)).toBe(join(dir, "elsewhere.ts"));
    },
  );
});
