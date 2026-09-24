/**
 * The mocks file's hash as an edit takes it: a file that turned into a link
 * or something other than a file counts as changed.
 */
import { mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { sha256Hex } from "../../src/server/file-hash";
import { hashMocksFile } from "../../src/server/mocks-edit/hash-mocks-file";
import { MocksFileChangedError } from "../../src/server/mocks-edit/mocks-file-changed-error";

let dir: string;

beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), "courier-hash-mocks-")));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function thrownBy(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  return "nothing thrown";
}

describe("hashMocksFile", () => {
  it("hashes the file's bytes, and gives null for nothing there", () => {
    const file = join(dir, "courier.mocks.ts");
    writeFileSync(file, "export default {};\n");

    expect(hashMocksFile(file)).toBe(sha256Hex("export default {};\n"));
    expect(hashMocksFile(join(dir, "courier.mocks.mts"))).toBeNull();
  });

  it("reports a link at the file's name as a change", () => {
    writeFileSync(join(dir, "real.ts"), "export default {};\n");
    symlinkSync(join(dir, "real.ts"), join(dir, "courier.mocks.ts"));

    expect(thrownBy(() => hashMocksFile(join(dir, "courier.mocks.ts")))).toBeInstanceOf(MocksFileChangedError);
  });
});
