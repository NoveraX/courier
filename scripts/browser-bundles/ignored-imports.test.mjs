/**
 * The imports a build left out as binding nothing of a module its package
 * declares does nothing as it loads, read off esbuild's warnings: the
 * module that imports and what it imports, as written; never an import
 * that binds what it uses, one of a module its package says does something
 * as it loads, nor any other warning.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ignoredImports } from "./ignored-imports.mjs";

const esbuild = createRequire(import.meta.url)("esbuild");
let root;

/* A file of the files given, written where its path says. */
function written(path, code) {
  const file = join(root, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, code);
  return file;
}

/* The core's package, declaring what its modules do as they load, and a page importing `lib/a.js`. */
function page(sideEffects) {
  written("packages/core/package.json", JSON.stringify({ type: "module", sideEffects }));
  return written("page.js", 'import { a } from "./packages/core/lib/a.js";\nconsole.log(a);');
}

/* The page built as an app's bundler builds it, warning only in what it returns. */
function built(entry) {
  return esbuild.buildSync({
    entryPoints: [entry],
    absWorkingDir: root,
    bundle: true,
    write: false,
    format: "esm",
    logLevel: "silent",
  });
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "courier-ignored-imports-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("ignoredImports", () => {
  it("names a module that imports one of its package's for nothing but loading it", () => {
    written("packages/core/lib/define/group-tree.js", 'export const GROUP_PATH_SEPARATOR = ".";');
    written("packages/core/lib/a.js", 'import "./define/group-tree.js";\nexport const a = ".";');

    expect(ignoredImports(built(page(false)))).toEqual([
      { module: "core/lib/a.js", imported: "./define/group-tree.js" },
    ]);
  });

  it("leaves an import that binds what it uses, and one of a module its package says does something", () => {
    written("packages/core/lib/register.js", "globalThis.registered = true;");
    written("packages/core/lib/separator.js", 'export const SEPARATOR = ".";');
    written(
      "packages/core/lib/a.js",
      'import "./register.js";\nimport { SEPARATOR } from "./separator.js";\nexport const a = SEPARATOR;',
    );

    expect(ignoredImports(built(page(["./lib/register.js"])))).toEqual([]);
  });

  it("reads no other warning of the build as one", () => {
    written("packages/core/lib/a.js", "export const a = { key: 1, key: 2 };");
    const result = built(page(false));

    expect(result.warnings.map((warning) => warning.id)).toEqual(["duplicate-object-key"]);
    expect(ignoredImports(result)).toEqual([]);
  });
});
