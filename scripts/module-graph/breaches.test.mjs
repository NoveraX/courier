/**
 * What an entry a page imports breaches: a module of an area only a server
 * runs, reached through a relative import or through the package's own
 * name; a module of an area a page takes from the package's root alone; a package outside the workspace that the importing package's
 * `module-sides.json` lets no page take; a package of the workspace with
 * no `module-sides.json`; a dynamic import or `require()` whose name a
 * bundler cannot tell, and an `import.meta.glob` of a pattern — each with
 * the way it was reached. The packages a page may take are told, not
 * breached.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { entryBreaches } from "./breaches.mjs";

const ts = createRequire(import.meta.url)("typescript");
let root;

function writeFiles(files) {
  for (const [path, code] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), code);
  }
}

/* The workspace: the core, React's hooks over it, and a server's package with no sides at all. */
function workspace() {
  const sided = (name, dir, exports, sides) => ({
    name,
    root: join(root, dir),
    exports,
    imports: {},
    lib: join(root, dir, "lib"),
    areas: Object.keys(sides?.serverAreas ?? {}),
    rootAreas: Object.keys(sides?.rootAreas ?? {}),
    sides,
  });
  return [
    sided(
      "@noverax/courier",
      "core",
      { "./server": { import: "./lib/server/index.js" } },
      {
        serverAreas: { "server/": "What a server runs" },
        rootAreas: { "utils/redact/": "What a page takes from the root alone" },
        pagePackages: { "@standard-schema/spec": "The schemas' types" },
        computedImports: { "client/allowed.js": "Loads what the page's own address names" },
      },
    ),
    sided("@noverax/courier-react", "react", "./lib/index.js", {
      pagePackages: { react: "The page's renderer" },
    }),
    sided("@noverax/courier-redis", "redis", "./lib/index.js", undefined),
  ];
}

function breachesOf(label, file) {
  return entryBreaches(ts, label, join(root, file), workspace());
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "courier-module-breaches-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("entryBreaches", () => {
  it("breaches with the server's entry a page module imports by the package's name, naming the way", () => {
    writeFiles({
      "core/lib/client/index.js": 'export { createProxyCaller } from "./proxy.js";',
      "core/lib/client/proxy.js":
        'import { getSources } from "@noverax/courier/server";\nexport const createProxyCaller = getSources;',
      "core/lib/server/index.js": "export const getSources = () => ({});",
    });

    expect(breachesOf("@noverax/courier/client", "core/lib/client/index.js").breaches).toEqual([
      "@noverax/courier/client reaches server/, which only a server runs: client/index.js → client/proxy.js → server/index.js",
    ]);
  });

  it("breaches with an area a page takes from the root alone, reached from a page's entry, naming the way", () => {
    writeFiles({
      "core/lib/client/index.js": 'export { redact } from "../utils/redact/redact.js";',
      "core/lib/utils/redact/redact.js": "export const redact = (value) => value;",
    });

    expect(breachesOf("@noverax/courier/client", "core/lib/client/index.js").breaches).toEqual([
      "@noverax/courier/client reaches utils/redact/, which a page takes from the root alone: client/index.js → utils/redact/redact.js",
    ]);
  });

  it("breaches with a package its module-sides.json lets no page take, and tells the ones it does", () => {
    writeFiles({
      "core/lib/client/index.js":
        'import { WebSocketServer } from "ws";\nimport { spec } from "@standard-schema/spec";',
    });

    const { breaches, foreign } = breachesOf("@noverax/courier/client", "core/lib/client/index.js");

    expect(breaches).toEqual([
      "@noverax/courier/client reaches ws, which @noverax/courier's module-sides.json lets no page take: client/index.js → ws",
    ]);
    expect(foreign).toEqual(["@standard-schema/spec"]);
  });

  it("breaches with a server's package in a module of React's hooks, though the core may take it", () => {
    writeFiles({
      "react/lib/index.js": 'import "ioredis";\nimport { useState } from "react";',
    });

    expect(breachesOf("@noverax/courier-react", "react/lib/index.js").breaches).toEqual([
      "@noverax/courier-react reaches ioredis, which @noverax/courier-react's module-sides.json lets no page take: index.js → ioredis",
    ]);
  });

  it("breaches with a package of the workspace that says nothing of what a page may take of it", () => {
    writeFiles({
      "react/lib/index.js": 'import { store } from "@noverax/courier-redis";',
      "redis/lib/index.js": 'import Redis from "ioredis";\nexport const store = Redis;',
    });

    expect(breachesOf("@noverax/courier-react", "react/lib/index.js").breaches).toEqual([
      "@noverax/courier-react reaches @noverax/courier-redis, which has no module-sides.json to say what a page may take of it: index.js → @noverax/courier-redis:index.js",
    ]);
  });

  it("breaches with a dynamic import or a require() whose name no bundler can tell, by module and line", () => {
    const index = [
      'import "./allowed.js";',
      'const name = "./x.js";',
      "export const later = () => import(name);",
      `export const now = () => require(\`./\${name}\`);`,
      "export const fixed = () => import(`./literal.js`);",
    ].join("\n");
    writeFiles({
      "core/lib/client/index.js": index,
      "core/lib/client/allowed.js": "export const page = (address) => import(address);",
      "core/lib/client/literal.js": "export {};",
    });

    expect(breachesOf("@noverax/courier/client", "core/lib/client/index.js").breaches).toEqual([
      "@noverax/courier/client reaches client/index.js, whose import() at line 3 names no module a bundler can tell: client/index.js",
      "@noverax/courier/client reaches client/index.js, whose require() at line 4 names no module a bundler can tell: client/index.js",
    ]);
  });

  /* B's probe: each line at the top of a module of React's hooks, a page's. */
  it.each([
    [
      'import.meta.glob("../../core/lib/server/*.js");',
      "@noverax/courier-react reaches index.js, whose import.meta.glob() at line 1 names modules by a pattern: index.js",
    ],
    [
      'new URL("../../core/lib/server/index.js", import.meta.url);',
      "@noverax/courier-react reaches server/ of @noverax/courier, which only a server runs: index.js → @noverax/courier:server/index.js",
    ],
    [
      'new Worker(new URL("../../core/lib/server/index.js", import.meta.url));',
      "@noverax/courier-react reaches server/ of @noverax/courier, which only a server runs: index.js → @noverax/courier:server/index.js",
    ],
    [
      'require.resolve("@noverax/courier/server");',
      "@noverax/courier-react reaches server/ of @noverax/courier, which only a server runs: index.js → @noverax/courier:server/index.js",
    ],
    [
      'globalThis.__servers = import.meta.webpackContext("../../core/lib/server", { recursive: false, regExp: /\\.js$/, mode: "lazy" });',
      "@noverax/courier-react reaches index.js, whose import.meta.webpackContext() at line 1 names modules by a pattern: index.js",
    ],
    [
      'require.context("../../core/lib/server", false, /\\.js$/);',
      "@noverax/courier-react reaches index.js, whose require.context() at line 1 names modules by a pattern: index.js",
    ],
    [
      'import.meta.resolve("../../core/lib/server/index.js");',
      "@noverax/courier-react reaches server/ of @noverax/courier, which only a server runs: index.js → @noverax/courier:server/index.js",
    ],
    [
      'require.ensure(["../../core/lib/server/index.js"], () => {});',
      "@noverax/courier-react reaches server/ of @noverax/courier, which only a server runs: index.js → @noverax/courier:server/index.js",
    ],
  ])("breaches with what %s reaches, which a bundler reads as an import", (line, breach) => {
    writeFiles({
      "react/lib/index.js": `${line}\nimport { useState } from "react";`,
      "core/lib/server/index.js": "export const getSources = () => ({});",
    });

    expect(breachesOf("@noverax/courier-react", "react/lib/index.js").breaches).toEqual([breach]);
  });

  it("breaches with a glob of a pattern, and a new URL or require.resolve whose name no bundler can tell", () => {
    const index = [
      'const at = "./x.js";',
      'import.meta.glob(["./literal.js", "./pages/*.js"]);',
      "import.meta.glob(at);",
      "new URL(at, import.meta.url);",
      `new Worker(new URL(\`./\${at}\`, import.meta.url));`,
      "require.resolve(at);",
      "import.meta.webpackContext(at);",
      "require.context(at, false);",
      "import.meta.resolve(at);",
      "require.ensure([at], () => {});",
    ].join("\n");
    writeFiles({
      "core/lib/client/index.js": index,
      "core/lib/client/literal.js": "export {};",
    });

    expect(breachesOf("@noverax/courier/client", "core/lib/client/index.js").breaches).toEqual([
      "@noverax/courier/client reaches client/index.js, whose import.meta.glob() at line 2 names modules by a pattern: client/index.js",
      "@noverax/courier/client reaches client/index.js, whose import.meta.glob() at line 3 names no module a bundler can tell: client/index.js",
      "@noverax/courier/client reaches client/index.js, whose new URL() at line 4 names no module a bundler can tell: client/index.js",
      "@noverax/courier/client reaches client/index.js, whose new URL() at line 5 names no module a bundler can tell: client/index.js",
      "@noverax/courier/client reaches client/index.js, whose require.resolve() at line 6 names no module a bundler can tell: client/index.js",
      "@noverax/courier/client reaches client/index.js, whose import.meta.webpackContext() at line 7 names no module a bundler can tell: client/index.js",
      "@noverax/courier/client reaches client/index.js, whose require.context() at line 8 names no module a bundler can tell: client/index.js",
      "@noverax/courier/client reaches client/index.js, whose import.meta.resolve() at line 9 names no module a bundler can tell: client/index.js",
      "@noverax/courier/client reaches client/index.js, whose require.ensure() at line 10 names no module a bundler can tell: client/index.js",
    ]);
  });
});
