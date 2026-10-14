/**
 * Whether the project names the files of its relative imports with their
 * extensions: a mocks file that is an ES module resolved as Node resolves
 * one, by the tsconfig or a project it references, or a config whose own
 * relative imports carry `.js` or `.mjs`.
 */
import { existsSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { writesExplicitExtensions } from "../../src/source/writes-explicit-extensions";

const NODE_NEXT = JSON.stringify({
  compilerOptions: { module: "NodeNext", moduleResolution: "NodeNext" },
});
const BUNDLER = JSON.stringify({
  compilerOptions: { module: "ESNext", moduleResolution: "bundler" },
});
const CONFIG = 'import { api } from "./src/api";\n\nexport default { sources: { api } };\n';

let root: string;

beforeEach(() => {
  vi.spyOn(console, "debug").mockImplementation(() => {});
  root = realpathSync(mkdtempSync(join(tmpdir(), "courier-explicit-extensions-")));
});

afterEach(() => {
  vi.restoreAllMocks();
  if (existsSync(root)) rmSync(root, { recursive: true, force: true });
});

function project(files: Record<string, string>): void {
  for (const [name, text] of Object.entries(files)) writeFileSync(join(root, name), text);
}

describe("writesExplicitExtensions", () => {
  it("names extensions for a .ts mocks file in a type module package that resolves as Node does", () => {
    project({
      "package.json": '{ "type": "module" }',
      "tsconfig.json": NODE_NEXT,
      "courier.config.ts": CONFIG,
    });

    expect(writesExplicitExtensions(root, "courier.mocks.ts", "courier.config.ts")).toBe(true);
  });

  it("names extensions where a solution tsconfig references a project that resolves as Node does", () => {
    project({
      "package.json": '{ "type": "module" }',
      "tsconfig.json": JSON.stringify({
        files: [],
        references: [{ path: "./tsconfig.node.json" }],
      }),
      "tsconfig.node.json": NODE_NEXT,
      "courier.config.ts": CONFIG,
    });

    expect(writesExplicitExtensions(root, "courier.mocks.ts", "courier.config.ts")).toBe(true);
  });

  it("names none where the project resolves modules as a bundler does", () => {
    project({
      "package.json": '{ "type": "module" }',
      "tsconfig.json": BUNDLER,
      "courier.config.ts": CONFIG,
    });

    expect(writesExplicitExtensions(root, "courier.mocks.ts", "courier.config.ts")).toBe(false);
  });

  it.each([['{ "type": "commonjs" }'], ["{}"]])(
    "names none for a .ts mocks file in a package of %s, which TypeScript reads as CommonJS",
    (manifest) => {
      project({
        "package.json": manifest,
        "tsconfig.json": NODE_NEXT,
        "courier.config.ts": CONFIG,
      });

      expect(writesExplicitExtensions(root, "courier.mocks.ts", "courier.config.ts")).toBe(false);
    },
  );

  it("names extensions for an .mts mocks file resolved as Node does, whatever its package says", () => {
    project({ "package.json": "{}", "tsconfig.json": NODE_NEXT, "courier.config.mts": CONFIG });

    expect(writesExplicitExtensions(root, "courier.mocks.mts", "courier.config.mts")).toBe(true);
  });

  it("names none for a .cts mocks file, which is CommonJS whatever its package says", () => {
    project({
      "package.json": '{ "type": "module" }',
      "tsconfig.json": NODE_NEXT,
      "courier.config.cts": CONFIG,
    });

    expect(writesExplicitExtensions(root, "courier.mocks.cts", "courier.config.cts")).toBe(false);
  });

  it.each([['import { api } from "./src/api.js";'], ['export { api } from "./src/api.mjs";']])(
    "names extensions where the config's own relative imports do: %s",
    (line) => {
      project({ "tsconfig.json": BUNDLER, "courier.config.ts": `${line}\n\nexport default {};\n` });

      expect(writesExplicitExtensions(root, "courier.mocks.ts", "courier.config.ts")).toBe(true);
    },
  );

  it("names none for a project without a tsconfig whose config imports without extensions", () => {
    project({ "package.json": '{ "type": "module" }', "courier.config.ts": CONFIG });

    expect(writesExplicitExtensions(root, "courier.mocks.ts", "courier.config.ts")).toBe(false);
  });

  it("names none when the config cannot be read", () => {
    expect(writesExplicitExtensions(root, "courier.mocks.ts", "courier.config.ts")).toBe(false);
  });
});
