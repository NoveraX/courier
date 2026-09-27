/**
 * Reading a tsconfig as TypeScript does, without TypeScript.
 */
import { existsSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { readTsconfig } from "../../src/server/mocks-edit/read-tsconfig";

let root: string;

beforeEach(() => {
  vi.spyOn(console, "debug").mockImplementation(() => {});
  root = realpathSync(mkdtempSync(join(tmpdir(), "courier-read-tsconfig-")));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  if (existsSync(root)) rmSync(root, { recursive: true, force: true });
});

describe("readTsconfig", () => {
  it("reads a tsconfig with comments and trailing commas", () => {
    const file = join(root, "tsconfig.json");
    writeFileSync(file, '{\n  // Node\'s own resolution\n  "compilerOptions": { "module": "NodeNext", },\n  "files": [],\n}\n');

    expect(readTsconfig(file)).toEqual({ compilerOptions: { module: "NodeNext" }, files: [] });
  });

  it("returns null for a tsconfig that does not parse, and says so at debug level", () => {
    const file = join(root, "tsconfig.json");
    writeFileSync(file, '{ "compilerOptions": { "module": "NodeNext" ');
    vi.stubEnv("COURIER_LOG_LEVEL", "debug");

    expect(readTsconfig(file)).toBeNull();
    expect(console.debug).toHaveBeenCalledWith(
      "%s",
      expect.stringContaining(`[Studio] Could not read ${file}, so the module options it sets are not known`),
      expect.any(SyntaxError),
    );
  });

  it("returns null for a tsconfig that is missing, and says so at debug level", () => {
    const file = join(root, "missing.json");
    vi.stubEnv("COURIER_LOG_LEVEL", "debug");

    expect(readTsconfig(file)).toBeNull();
    expect(console.debug).toHaveBeenCalledWith(
      "%s",
      expect.stringContaining(`[Studio] Could not read ${file}`),
      expect.objectContaining({ code: "ENOENT" }),
    );
  });

  it("returns null for a tsconfig that holds no object", () => {
    const file = join(root, "tsconfig.json");
    writeFileSync(file, '"NodeNext"\n');

    expect(readTsconfig(file)).toBeNull();
  });
});
