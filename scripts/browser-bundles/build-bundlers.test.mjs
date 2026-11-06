/**
 * What a page loads at start under webpack and under Vite: the entry and
 * what it imports statically, minified, and the files of those modules —
 * not what a dynamic import loads when a call needs it, which is among
 * the files of every chunk. Both name a file with forward slashes, on
 * Windows too, and are compared so.
 */
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { viteStart } from "./build-vite.mjs";
import { webpackStart } from "./build-webpack.mjs";
import { slashed } from "./file-paths.mjs";

const require = createRequire(import.meta.url);
let dir;
let entry;

/* A file of the scenario's folder, as the builds name it. */
const fileOf = (name) => slashed(join(dir, name));

beforeAll(() => {
  /* Real, as the bundlers name a module's file: a temporary folder may sit behind a link, and on
     Windows under a short name, which only the system's own resolution expands. */
  dir = realpathSync.native(mkdtempSync(join(tmpdir(), "courier-bundlers-")));
  entry = join(dir, "page.js");
  writeFileSync(
    entry,
    'import { atStart } from "./static.js";\nconsole.log(atStart);\nexport const later = () => import("./lazy.js");',
  );
  writeFileSync(join(dir, "static.js"), 'export const atStart = "loaded-at-start";');
  writeFileSync(join(dir, "lazy.js"), 'export const lazy = "loaded-on-demand";');
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("webpackStart", () => {
  it("holds the entry's static imports and leaves a dynamic import's chunk out", async () => {
    const start = await webpackStart(require("webpack"), entry, join(dir, "webpack"), []);

    expect(start.code).toContain("loaded-at-start");
    expect(start.code).not.toContain("loaded-on-demand");
    expect(start.modules).toContain(fileOf("static.js"));
    expect(start.modules).not.toContain(fileOf("lazy.js"));
    expect(start.everyModule).toEqual(
      expect.arrayContaining([fileOf("static.js"), fileOf("lazy.js")]),
    );
  });
});

describe("viteStart", () => {
  it("holds the entry's static imports and leaves a dynamic import's chunk out", async () => {
    const start = await viteStart(await import(require.resolve("vite")), entry, dir, []);

    expect(start.code).toContain("loaded-at-start");
    expect(start.code).not.toContain("loaded-on-demand");
    expect(start.modules).toContain(fileOf("static.js"));
    expect(start.modules).not.toContain(fileOf("lazy.js"));
    expect(start.everyModule).toEqual(
      expect.arrayContaining([fileOf("static.js"), fileOf("lazy.js")]),
    );
  });
});
