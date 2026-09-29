/**
 * Which courier.config or courier.mocks files the runtime's loader hands to
 * Node as CommonJS: a .cjs file, and a .js file outside a "type": "module"
 * package that has no ES module syntax.
 */
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isCommonJsEntry } from "../src/server/is-commonjs-entry";

const COMMONJS = "module.exports = {};\n";

let dir: string;

beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), "courier-commonjs-entry-")));
});

afterEach(() => {
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
});

function writePackage(manifest: string): void {
  writeFileSync(join(dir, "package.json"), manifest);
}

describe("isCommonJsEntry", () => {
  it("takes a .cjs file for CommonJS, whatever its package says", () => {
    writePackage(JSON.stringify({ type: "module" }));

    expect(isCommonJsEntry(join(dir, "courier.config.cjs"), COMMONJS)).toBe(true);
  });

  it.each([
    ["courier.config.mjs"],
    ["courier.config.ts"],
    ["courier.config.mts"],
    ["courier.config.cts"],
  ])("takes %s for an ES module", (name) => {
    expect(isCommonJsEntry(join(dir, name), COMMONJS)).toBe(false);
  });

  it("takes a .js file for CommonJS outside a type: module package", () => {
    writePackage(JSON.stringify({ type: "commonjs" }));

    expect(isCommonJsEntry(join(dir, "courier.config.js"), COMMONJS)).toBe(true);
  });

  it("takes a .js file for CommonJS when no package.json is above it", () => {
    expect(isCommonJsEntry(join(dir, "courier.config.js"), COMMONJS)).toBe(true);
  });

  it("takes a .js file for an ES module in a type: module package, by the nearest package.json", () => {
    writePackage(JSON.stringify({ type: "commonjs" }));
    mkdirSync(join(dir, "app"));
    writeFileSync(join(dir, "app", "package.json"), JSON.stringify({ type: "module" }));

    expect(isCommonJsEntry(join(dir, "app", "courier.config.js"), COMMONJS)).toBe(false);
  });

  it.each([
    ["export default {};\n"],
    ['import { api } from "./api";\nmodule.exports = { api };\n'],
    ['import "./setup";\n'],
    ["const here = import.meta.url;\n"],
  ])(
    "takes a .js file with ES module syntax for an ES module outside a type: module package: %j",
    (source) => {
      expect(isCommonJsEntry(join(dir, "courier.config.js"), source)).toBe(false);
    },
  );

  it("takes a package.json that does not parse for one that declares no type", () => {
    writePackage("{ not json");

    expect(isCommonJsEntry(join(dir, "courier.config.js"), COMMONJS)).toBe(true);
  });
});
