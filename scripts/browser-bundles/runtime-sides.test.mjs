/**
 * What a server or an app takes of the core, built as their bundlers build
 * it: every module only a server runs, whether the root reaches it or only
 * the server's entry does, and none of their browser stand-ins.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import { runtimeSideBreaches, SERVER_TAKES } from "./runtime-sides.mjs";

const esbuild = createRequire(import.meta.url)("esbuild");
const work = mkdtempSync(join(tmpdir(), "courier-runtime-sides-"));

afterAll(() => rmSync(work, { recursive: true, force: true }));

/* A core of three modules only a server runs: one the root reaches, one only the server's entry
   reaches, and one neither does — each with its browser stand-in, as the core's build has them. */
const CORE = {
  "package.json": JSON.stringify({
    name: "@noverax/courier",
    type: "module",
    exports: { ".": "./lib/index.js", "./server": "./lib/server/index.js" },
    imports: {
      "#courier-server/*": {
        "react-native": "./lib/*",
        browser: "./lib/browser/*",
        default: "./lib/*",
      },
    },
  }),
  "lib/index.js": 'export { rootsOwn } from "#courier-server/roots-own.js";',
  "lib/server/index.js": 'export { serversOwn } from "#courier-server/servers-own.js";',
  "lib/roots-own.js": "export const rootsOwn = 1;",
  "lib/servers-own.js": "export const serversOwn = 2;",
  "lib/neithers.js": "export const neithers = 3;",
  "lib/browser/roots-own.js": "export const rootsOwn = 0;",
  "lib/browser/servers-own.js": "export const serversOwn = 0;",
  "lib/browser/neithers.js": "export const neithers = 0;",
};
const SERVER_ONLY = ["neithers.js", "roots-own.js", "servers-own.js"];

for (const [path, text] of Object.entries(CORE)) {
  const file = join(work, "node_modules/@noverax/courier", path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
}

function inputsFor(options) {
  const entry = join(work, "server-takes.js");
  writeFileSync(entry, SERVER_TAKES.code);
  const result = esbuild.buildSync({
    entryPoints: [entry],
    bundle: true,
    write: false,
    metafile: true,
    format: "esm",
    logLevel: "silent",
    absWorkingDir: work,
    ...options,
  });
  return Object.keys(result.metafile.inputs);
}

describe("what a server or an app takes of the core", () => {
  it("takes a module only a server runs that only the server's entry reaches, and names one neither reaches", () => {
    for (const [runtime, options] of [
      ["Node", { platform: "node" }],
      ["React Native", { platform: "neutral", conditions: ["react-native"] }],
    ]) {
      expect(runtimeSideBreaches(runtime, inputsFor(options), SERVER_ONLY)).toEqual([
        `${runtime} does not take the server's neithers.js`,
      ]);
    }
  });

  it("names a stand-in a build takes in place of the server's module", () => {
    const inputs = inputsFor({ platform: "neutral", conditions: ["browser"] });

    expect(runtimeSideBreaches("a page", inputs, SERVER_ONLY)).toEqual([
      "a page takes the browser's roots-own.js in place of the server's",
      "a page takes the browser's servers-own.js in place of the server's",
      "a page does not take the server's neithers.js",
      "a page does not take the server's roots-own.js",
      "a page does not take the server's servers-own.js",
    ]);
  });
});
