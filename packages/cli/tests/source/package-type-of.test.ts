/**
 * The `type` of the nearest package.json above a file, which tells Node and
 * TypeScript whether a .js or .ts file is an ES module.
 */
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { packageTypeOf } from "../../src/source/package-type-of";

let dir: string;

beforeEach(() => {
  vi.spyOn(console, "debug").mockImplementation(() => {});
  dir = realpathSync(mkdtempSync(join(tmpdir(), "courier-package-type-")));
});

afterEach(() => {
  vi.restoreAllMocks();
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
});

describe("packageTypeOf", () => {
  it("reads the type of the package.json beside the file", () => {
    writeFileSync(join(dir, "package.json"), JSON.stringify({ type: "module" }));

    expect(packageTypeOf(join(dir, "courier.config.ts"))).toBe("module");
  });

  it("reads the nearest package.json above the file, not one further up", () => {
    writeFileSync(join(dir, "package.json"), JSON.stringify({ type: "module" }));
    mkdirSync(join(dir, "app"));
    writeFileSync(join(dir, "app", "package.json"), JSON.stringify({ name: "app" }));

    expect(packageTypeOf(join(dir, "app", "courier.config.ts"))).toBeUndefined();
  });

  it("reads no type from a package.json that does not parse", () => {
    writeFileSync(join(dir, "package.json"), '{ "type": "module", ');

    expect(packageTypeOf(join(dir, "courier.config.ts"))).toBeUndefined();
  });

  it("reads no type from a package.json that holds no object", () => {
    writeFileSync(join(dir, "package.json"), "null");

    expect(packageTypeOf(join(dir, "courier.config.ts"))).toBeUndefined();
  });
});
