/**
 * What a page entry reaches: every module through static imports,
 * re-exports and dynamic imports alike, the package's own server-only
 * imports through their stand-ins, and every import that leads to nothing
 * or to Node — before any bundler has dropped a thing.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { chainTo, reachedFrom } from "./reach.mjs";
import { underLib } from "./resolve-import.mjs";

const ts = createRequire(import.meta.url)("typescript");
let root;

/* A package of published modules, each path under the package to its code. */
function writePackage(files) {
  for (const [path, code] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), code);
  }
}

const IMPORTS = {
  "#courier-server/*": { "edge-light": "./lib/*", browser: "./lib/browser/*", default: "./lib/*" },
};
const EXPORTS = { "./server": { import: "./lib/server/index.js" } };

function reached(entry) {
  const packages = [{ name: "@noverax/courier", root, exports: EXPORTS, imports: IMPORTS }];
  const found = reachedFrom(ts, join(root, "lib", entry), packages);
  return {
    ...found,
    names: [...found.parents.keys()].map((path) => underLib(join(root, "lib"), path)),
  };
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "courier-module-graph-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("reachedFrom", () => {
  it("follows static imports, re-exports and dynamic imports alike", () => {
    writePackage({
      "lib/client/index.js": 'import { a } from "./a.js";\nexport { b } from "./b.js";',
      "lib/client/a.js": 'export const a = () => import("../adapter/handler.js");',
      "lib/client/b.js": "export const b = 1;",
      "lib/adapter/handler.js": "export const handler = 1;",
    });

    expect(reached("client/index.js").names).toEqual([
      "client/index.js",
      "client/a.js",
      "client/b.js",
      "adapter/handler.js",
    ]);
  });

  it("follows what a bundler reads as an import though no import names it", () => {
    const index = [
      'export const pages = import.meta.glob("./a.js");',
      'export const icon = new URL("./b.js", import.meta.url);',
      'export const worker = new Worker(new URL("./c.js", import.meta.url));',
      'export const path = require.resolve("./d.js");',
      'export const more = import.meta.glob(["./e.js"]);',
      'export const resolved = import.meta.resolve("./f.js");',
      'export const ensured = () => require.ensure(["./g.js"], () => {});',
      'export const remote = new URL("https://cdn.example/x.js", import.meta.url);',
      'export const elsewhere = new URL("./gone.js", "https://app.example/");',
    ].join("\n");
    writePackage({
      "lib/client/index.js": index,
      ...Object.fromEntries(
        ["a", "b", "c", "d", "e", "f", "g"].map((name) => [`lib/client/${name}.js`, "export {};"]),
      ),
    });

    const { names, missing } = reached("client/index.js");

    expect(names).toEqual([
      "client/index.js",
      "client/a.js",
      "client/b.js",
      "client/c.js",
      "client/d.js",
      "client/e.js",
      "client/f.js",
      "client/g.js",
    ]);
    expect(missing).toEqual([]);
  });

  it("takes the stand-in a page's bundler takes for a server-only import", () => {
    writePackage({
      "lib/client/index.js": 'import { log } from "#courier-server/logger/server.js";',
      "lib/logger/server.js": 'import { stdout } from "node:process";',
      "lib/browser/logger/server.js": "export const log = console.log;",
    });

    const { names, builtins } = reached("client/index.js");

    expect(names).toEqual(["client/index.js", "browser/logger/server.js"]);
    expect(builtins).toEqual([]);
  });

  it("tells a built-in module of Node it reaches, and another package, without following it", () => {
    writePackage({
      "lib/client/index.js": 'import "node:fs";\nimport { spec } from "@standard-schema/spec";',
    });

    const { names, builtins, foreign } = reached("client/index.js");

    expect(names).toEqual(["client/index.js"]);
    expect(builtins.map((each) => each.name)).toEqual(["node:fs"]);
    expect(foreign.map((each) => each.name)).toEqual(["@standard-schema/spec"]);
  });

  it("follows the package's own name through its exports, as a relative import", () => {
    writePackage({
      "lib/client/index.js": 'import { getSources } from "@noverax/courier/server";',
      "lib/server/index.js": 'export { getSources } from "./sources.js";',
      "lib/server/sources.js": "export const getSources = () => ({});",
    });

    expect(reached("client/index.js").names).toEqual([
      "client/index.js",
      "server/index.js",
      "server/sources.js",
    ]);
  });

  it("tells an import that leads to nothing rather than reading past it", () => {
    writePackage({ "lib/client/index.js": 'import { gone } from "./gone.js";' });

    const { missing } = reached("client/index.js");

    expect(missing).toHaveLength(1);
    expect(missing[0]?.reason).toContain("./gone.js names");
  });
});

describe("chainTo", () => {
  it("gives the way from the entry, each step the module that first imported the next", () => {
    const parents = new Map([
      ["entry", null],
      ["caller", "entry"],
      ["session", "caller"],
    ]);

    expect(chainTo(parents, "session")).toEqual(["entry", "caller", "session"]);
  });
});
