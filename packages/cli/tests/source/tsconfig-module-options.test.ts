/**
 * The module options a tsconfig sets, merged down the chain of configs it
 * extends as TypeScript merges them.
 */
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { tsconfigModuleOptions } from "../../src/source/tsconfig-module-options";

let root: string;

beforeEach(() => {
  vi.spyOn(console, "debug").mockImplementation(() => {});
  root = realpathSync(mkdtempSync(join(tmpdir(), "courier-module-options-")));
});

afterEach(() => {
  vi.restoreAllMocks();
  if (existsSync(root)) rmSync(root, { recursive: true, force: true });
});

function write(relative: string, value: unknown): void {
  const file = join(root, relative);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, typeof value === "string" ? value : JSON.stringify(value));
}

function optionsOf(config: Record<string, unknown>) {
  return tsconfigModuleOptions(join(root, "tsconfig.json"), config);
}

describe("tsconfigModuleOptions", () => {
  it("takes the tsconfig's own module and moduleResolution", () => {
    expect(
      optionsOf({
        compilerOptions: { module: "NodeNext", moduleResolution: "NodeNext", strict: true },
      }),
    ).toEqual({
      module: "NodeNext",
      moduleResolution: "NodeNext",
    });
  });

  it("sets nothing for options that are missing or not strings", () => {
    expect(optionsOf({})).toEqual({});
    expect(optionsOf({ compilerOptions: { module: 1, moduleResolution: null } })).toEqual({});
  });

  it("takes the options of the config it extends", () => {
    write("configs/base.json", { compilerOptions: { module: "NodeNext" } });

    expect(optionsOf({ extends: "./configs/base.json" })).toEqual({ module: "NodeNext" });
  });

  it("finds an extended config written without its .json, or as the directory holding it", () => {
    write("configs/node.json", { compilerOptions: { module: "node16" } });
    write("shared/tsconfig.json", { compilerOptions: { module: "node20" } });

    expect(optionsOf({ extends: "./configs/node" })).toEqual({ module: "node16" });
    expect(optionsOf({ extends: "./shared" })).toEqual({ module: "node20" });
  });

  it("takes the options of an installed package's tsconfig.json", () => {
    write("node_modules/@acme/tsconfig/tsconfig.json", { compilerOptions: { module: "node16" } });
    write("node_modules/@acme/tsconfig/package.json", { name: "@acme/tsconfig", main: "index.js" });
    write("node_modules/@acme/tsconfig/index.js", "module.exports = {};\n");

    expect(optionsOf({ extends: "@acme/tsconfig" })).toEqual({ module: "node16" });
  });

  it("lets the tsconfig's own options override those it extends", () => {
    write("base.json", { compilerOptions: { module: "NodeNext", moduleResolution: "NodeNext" } });

    expect(
      optionsOf({ extends: "./base.json", compilerOptions: { moduleResolution: "bundler" } }),
    ).toEqual({
      module: "NodeNext",
      moduleResolution: "bundler",
    });
  });

  it("lets a later entry of an extends array override an earlier one", () => {
    write("node.json", { compilerOptions: { module: "NodeNext", moduleResolution: "NodeNext" } });
    write("bundler.json", { compilerOptions: { module: "ESNext", moduleResolution: "bundler" } });

    expect(optionsOf({ extends: ["./node.json", "./bundler.json"] })).toEqual({
      module: "ESNext",
      moduleResolution: "bundler",
    });
    expect(optionsOf({ extends: ["./bundler.json", "./node.json"] })).toEqual({
      module: "NodeNext",
      moduleResolution: "NodeNext",
    });
  });

  it("brings a base again with each entry of an extends array that extends it, as TypeScript does", () => {
    write("base.json", { compilerOptions: { module: "NodeNext", moduleResolution: "NodeNext" } });
    write("bundler.json", {
      extends: "./base.json",
      compilerOptions: { module: "ESNext", moduleResolution: "bundler" },
    });
    write("strict.json", { extends: "./base.json" });

    expect(optionsOf({ extends: ["./bundler.json", "./strict.json"] })).toEqual({
      module: "NodeNext",
      moduleResolution: "NodeNext",
    });
  });

  it("ends a chain of configs that extend each other", () => {
    write("a.json", { extends: "./tsconfig.json", compilerOptions: { module: "NodeNext" } });
    write("tsconfig.json", { extends: "./a.json" });

    expect(optionsOf({ extends: "./a.json" })).toEqual({ module: "NodeNext" });
  });

  it("skips an extended config it cannot find, read or parse, and an entry that is not a string", () => {
    write("broken.json", '{ "compilerOptions": { "module": "ESNext" ');

    const options = optionsOf({
      extends: ["@acme/missing", "./missing.json", "./broken.json", 7],
      compilerOptions: { module: "NodeNext" },
    });

    expect(options).toEqual({ module: "NodeNext" });
  });
});
