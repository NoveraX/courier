/**
 * The globals of Node that the workspace's modules a page took refer to,
 * read module by module as esbuild reads them: the global, never a binding
 * of the module's own, a property or text; of `process`, a read of
 * `process.env` alone goes, which bundlers replace; and a check for the
 * global counts as a use, as Parcel takes it.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { nodeGlobalReads } from "./node-globals.mjs";

const esbuild = createRequire(import.meta.url)("esbuild");
let root;

/* A module of the files given, written where its path says. */
function written(path, code) {
  const file = join(root, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, code);
  return file;
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "courier-node-globals-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("nodeGlobalReads", () => {
  it("names the module of a page whose code makes a Buffer", () => {
    const page = written("packages/core/lib/page.js", 'export const bytes = Buffer.from("x");');

    expect(nodeGlobalReads(esbuild, [page])).toEqual([
      { module: "core/lib/page.js", global: "Buffer" },
    ]);
  });

  it("reads each global of Node, a check for one first among them", () => {
    const code = [
      'export const size = typeof Buffer === "function" ? 1 : 0;',
      "export const root = global;",
      "export const here = [__dirname, __filename];",
      "export const later = [setImmediate, clearImmediate];",
      "export const node = process.versions.node;",
    ].join("\n");
    const page = written("packages/react/lib/hooks.js", code);

    expect(nodeGlobalReads(esbuild, [page]).map((read) => read.global)).toEqual([
      "Buffer",
      "global",
      "__dirname",
      "__filename",
      "setImmediate",
      "clearImmediate",
      "process",
    ]);
  });

  it("reads no binding of the module's own, no property, no text, and of process only past process.env", () => {
    const code = [
      'export function sized(Buffer) { return Buffer.from("x"); }',
      "const global = {};",
      "export { global };",
      "export const named = { Buffer: 1, process: 2 }.Buffer;",
      'export const said = "Buffer, global and __dirname";',
      "export const mode = process.env.NODE_ENV;",
      "export const env = process?.env;",
    ].join("\n");
    const page = written("packages/core/lib/page.js", code);

    expect(nodeGlobalReads(esbuild, [page])).toEqual([]);
  });

  it("reads the workspace's modules alone, whatever else the build took", () => {
    const other = written("node_modules/other/index.js", "export const bytes = Buffer.from('x');");
    const page = written("packages/core/lib/page.js", "export const page = 1;");

    expect(nodeGlobalReads(esbuild, [other, page, `${page}?commonjs-proxy`, "\0virtual"])).toEqual(
      [],
    );
  });
});
