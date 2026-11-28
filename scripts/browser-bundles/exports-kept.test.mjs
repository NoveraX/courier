/**
 * What a page's modules keep beside an application's other pages, built in
 * one compilation as Next.js builds an app's pages, against what they keep
 * with the page alone: a module the pages share keeps every export one of
 * them takes, and brings what such an export imports.
 */
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { keptBeyond, webpackKeptExports } from "./exports-kept.mjs";
import { slashed } from "./file-paths.mjs";

const require = createRequire(import.meta.url);
let dir;

/* A file of the pages' folder, as the build names it. */
const fileOf = (name) => slashed(join(dir, name));

beforeAll(() => {
  /* Real, as webpack names a module's file: a temporary folder may sit behind a link. */
  dir = realpathSync.native(mkdtempSync(join(tmpdir(), "courier-kept-")));
  writeFileSync(
    join(dir, "shared.js"),
    'import { spell } from "./spell.js";\nexport const taken = "taken by both";\nexport function onlyCalled() { return spell("called"); }',
  );
  writeFileSync(join(dir, "spell.js"), "export const spell = (word) => word.toUpperCase();");
  writeFileSync(
    join(dir, "definitions.js"),
    'import { taken } from "./shared.js";\nconsole.log(taken);',
  );
  writeFileSync(
    join(dir, "caller.js"),
    'import { onlyCalled, taken } from "./shared.js";\nconsole.log(taken, onlyCalled());',
  );
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("webpackKeptExports", () => {
  it("keeps in a module the page shares every export the other pages take", async () => {
    const definitions = join(dir, "definitions.js");
    const alone = await webpackKeptExports(
      require("webpack"),
      { definitions },
      "definitions",
      join(dir, "alone"),
      [],
    );
    const beside = await webpackKeptExports(
      require("webpack"),
      { definitions, caller: join(dir, "caller.js") },
      "definitions",
      join(dir, "beside"),
      [],
    );

    expect(alone.get(fileOf("shared.js"))).toEqual(["taken"]);
    expect(alone.has(fileOf("spell.js"))).toBe(false);
    expect(keptBeyond(alone, beside)).toEqual([
      { module: fileOf("shared.js"), exports: ["onlyCalled"], loadedAlone: true },
      { module: fileOf("spell.js"), exports: ["spell"], loadedAlone: false },
    ]);
  });
});

describe("keptBeyond", () => {
  it("leaves out a module that keeps no more, and one that keeps every export alone", () => {
    const alone = new Map([
      ["same.js", ["a"]],
      ["whole.js", true],
    ]);
    const beside = new Map([
      ["same.js", ["a"]],
      ["whole.js", true],
    ]);

    expect(keptBeyond(alone, beside)).toEqual([]);
  });

  it("says a module that keeps every export beside the others keeps them all past its own", () => {
    expect(keptBeyond(new Map([["a.js", ["x"]]]), new Map([["a.js", true]]))).toEqual([
      { module: "a.js", exports: true, loadedAlone: true },
    ]);
  });
});
