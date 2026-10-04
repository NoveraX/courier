/**
 * @vitest-environment node
 */
import { existsSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { findMocksFile } from "../src/runtime/find-mocks-file";

let dir: string;

beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), "courier-find-mocks-file-")));
});

afterEach(() => {
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
});

describe("findMocksFile", () => {
  it("finds nothing in a project that declares no mocks", () => {
    expect(findMocksFile(dir)).toBeNull();
  });

  it("takes courier.mocks.ts before the other names", () => {
    writeFileSync(join(dir, "courier.mocks.js"), "export default {};\n");
    writeFileSync(join(dir, "courier.mocks.ts"), "export default {};\n");

    expect(findMocksFile(dir)).toBe(join(dir, "courier.mocks.ts"));
  });

  it("counts a link whose target is gone as present, so it can be reported", () => {
    symlinkSync(join(dir, "gone.ts"), join(dir, "courier.mocks.mjs"));

    expect(findMocksFile(dir)).toBe(join(dir, "courier.mocks.mjs"));
  });
});
