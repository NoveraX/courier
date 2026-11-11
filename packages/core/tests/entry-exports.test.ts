/**
 * The names each entry a page or a server imports offers, written down in
 * `entry-exports.json` for the tools that move an import from one entry to
 * another — the upgrade sends a page's import to `/client` when every name
 * it takes is there — and held to what the entries export, values and
 * types alike. A name added to an entry is added to the list in the same
 * change. A name an entry binds to another value than the root does is
 * marked, as the built entries have it: moved to it, an import of that
 * name takes another function, which only a file no server imports may.
 * The values a page takes from the root alone are named beside the page's
 * entry, apart from the server's: those of the areas `module-sides.json`
 * names the root's, which the page's entry leaves out, so a tool sends a
 * page's import of one to no other entry, and calls it no server's name.
 * The built entries are imported with the module, as the sources are, and
 * compared once loaded: a load that waits on other files' builds counts
 * against no test's time.
 */
import { readFileSync } from "node:fs";
import { relative } from "node:path";
import { fileURLToPath } from "node:url";
import * as builtRoot from "@noverax/courier";
import * as builtClient from "@noverax/courier/client";
import * as builtServer from "@noverax/courier/server";
import ts from "typescript";
import { describe, expect, it } from "vitest";

import * as client from "../src/client";
import * as server from "../src/server";

interface Names {
  values: string[];
  types: string[];
  /** The values it binds to another value than the root does, each with what it is */
  otherThanRoot?: Record<string, string>;
  /** The values a page takes from the root alone, which the page's entry leaves out, each with what it is */
  rootOnly?: Record<string, string>;
}

const ENTRIES = {
  "./client": { module: client, file: "../src/client/index.ts", built: builtClient },
  "./server": { module: server, file: "../src/server/index.ts", built: builtServer },
} as const;

function isNames(value: unknown): value is Names {
  if (typeof value !== "object" || value === null) return false;
  const { values, types, otherThanRoot, rootOnly } = value as Record<string, unknown>;
  return (
    [values, types].every(
      (list) => Array.isArray(list) && list.every((name) => typeof name === "string"),
    ) && [otherThanRoot ?? {}, rootOnly ?? {}].every(isMarks)
  );
}

function isMarks(marks: unknown): boolean {
  return (
    typeof marks === "object" &&
    marks !== null &&
    Object.values(marks).every((what) => typeof what === "string")
  );
}

/* The list as the file writes it, each entry's names checked to be names. */
function listed(): Record<string, Names> {
  const parsed: unknown = JSON.parse(
    readFileSync(new URL("../entry-exports.json", import.meta.url), "utf8"),
  );
  if (typeof parsed !== "object" || parsed === null) throw new Error("not a record");
  return Object.fromEntries(
    Object.entries(parsed).map(([entry, names]: [string, unknown]) => {
      if (!isNames(names)) throw new Error(`${entry} lists no values and types`);
      return [entry, names];
    }),
  );
}

const COMPILED: ts.CompilerOptions = {
  strict: true,
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  skipLibCheck: true,
  noEmit: true,
  types: [],
};

/* The types each entry exports, as the compiler reads its module: a name with no value. */
function typesOf(files: readonly string[]): string[][] {
  const paths = files.map((file) => fileURLToPath(new URL(file, import.meta.url)));
  const program = ts.createProgram(paths, COMPILED);
  const checker = program.getTypeChecker();
  return paths.map((path) => {
    const source = program.getSourceFile(path);
    const symbol = source && checker.getSymbolAtLocation(source);
    if (symbol === undefined) throw new Error(`${path} is no module`);
    return checker
      .getExportsOfModule(symbol)
      .filter((exported) => {
        const target =
          exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported;
        return (target.flags & ts.SymbolFlags.Value) === 0;
      })
      .map((exported) => exported.name)
      .sort();
  });
}

/* The values the root exports from the areas module-sides.json names its own, as the compiler reads
   where each is declared: an area is a folder or a file of the build, whose sources lie the same way. */
function rootValuesOfItsAreas(): string[] {
  const sides: unknown = JSON.parse(
    readFileSync(new URL("../module-sides.json", import.meta.url), "utf8"),
  );
  const areas = Object.keys(
    typeof sides === "object" && sides !== null ? (Reflect.get(sides, "rootAreas") ?? {}) : {},
  );
  const sources = fileURLToPath(new URL("../src/", import.meta.url));
  const path = fileURLToPath(new URL("../src/index.ts", import.meta.url));
  const program = ts.createProgram([path], COMPILED);
  const checker = program.getTypeChecker();
  const source = program.getSourceFile(path);
  const symbol = source && checker.getSymbolAtLocation(source);
  if (symbol === undefined) throw new Error(`${path} is no module`);
  const inArea = (file: string) => {
    const built = relative(sources, file).replaceAll("\\", "/").replace(/\.ts$/, ".js");
    return areas.some((area) => (area.endsWith("/") ? built.startsWith(area) : built === area));
  };
  return checker
    .getExportsOfModule(symbol)
    .filter((exported) => {
      const target =
        exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported;
      const file = target.declarations?.[0]?.getSourceFile().fileName;
      return (target.flags & ts.SymbolFlags.Value) !== 0 && file !== undefined && inArea(file);
    })
    .map((exported) => exported.name)
    .sort();
}

describe("the names each entry offers", () => {
  it("are listed for the entries a page and a server import, and those alone", () => {
    expect(Object.keys(listed()).sort()).toEqual(Object.keys(ENTRIES).sort());
  });

  it.each(Object.entries(ENTRIES))("%s offers the values its list names", (entry, { module }) => {
    expect(Object.keys(module).sort()).toEqual(listed()[entry]?.values);
  });

  it.each(Object.entries(ENTRIES))(
    "%s marks the names it binds to another value than the root does, and those alone",
    (entry, { built }) => {
      const root: Record<string, unknown> = builtRoot;
      const own: Record<string, unknown> = built;
      const other = Object.keys(own).filter((name) => name in root && own[name] !== root[name]);
      const marked = Object.keys(listed()[entry]?.otherThanRoot ?? {});

      expect(
        other.filter((name) => !marked.includes(name)),
        `${entry} binds these to other values than the root does: mark them in entry-exports.json`,
      ).toEqual([]);
      expect(
        marked.filter((name) => !other.includes(name)),
        `${entry} marks these, which it binds to the root's own values`,
      ).toEqual([]);
    },
  );

  it("name the values a page takes from the root alone beside the page's entry: the root's of its areas, which the entry leaves out", () => {
    const named = Object.keys(listed()["./client"]?.rootOnly ?? {}).sort();
    const root: Record<string, unknown> = builtRoot;

    expect(named).toEqual(rootValuesOfItsAreas());
    expect(named.length).toBeGreaterThan(0);
    expect(named.filter((name) => !(name in root) || name in builtClient)).toEqual([]);
    expect(listed()["./server"]?.rootOnly).toBeUndefined();
  });

  it("offer the types their lists name", () => {
    const entries = Object.entries(ENTRIES);
    const types = typesOf(entries.map(([, { file }]) => file));

    entries.forEach(([entry], at) => {
      expect(types[at]).toEqual(listed()[entry]?.types);
    });
  });
});
