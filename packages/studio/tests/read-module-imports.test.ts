import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type * as OxcParser from "oxc-parser";
import { parseSync } from "oxc-parser";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { readModuleImports } from "../src/server/read-module-imports";

vi.mock("oxc-parser", async (importOriginal) => {
  const actual = await importOriginal<typeof OxcParser>();
  return { ...actual, parseSync: vi.fn(actual.parseSync) };
});

/** The specifiers `path` imports, as the walk reads them. */
function readImportSpecifiers(path: string): string[] {
  return [...readModuleImports(path).specifiers];
}

let dir: string;

function file(name: string, body: string): string {
  const path = join(dir, name);
  writeFileSync(path, body, "utf-8");
  return path;
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "courier-import-specifiers-"));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.mocked(parseSync).mockClear();
  rmSync(dir, { recursive: true, force: true });
});

describe("readModuleImports", () => {
  it("returns nothing for a file that imports nothing", () => {
    expect(readImportSpecifiers(file("a.ts", `export const x = 1;`))).toEqual([]);
  });

  /* A module imported for its types alone is erased before the config runs. */
  it("reads value, default, namespace and side-effect imports, and leaves out type-only ones", () => {
    const path = file(
      "a.ts",
      `import { a } from "./value";
       import type { B } from "./type";
       import c from "./default";
       import * as d from "./namespace";
       import "./side-effect";`,
    );

    expect(readImportSpecifiers(path).sort()).toEqual([
      "./default",
      "./namespace",
      "./side-effect",
      "./value",
    ]);
  });

  it("reads re-export sources, and ignores local exports and type-only re-exports", () => {
    const path = file(
      "a.ts",
      `export { a } from "./named";
       export * from "./all";
       export * as ns from "./namespaced";
       export type { T } from "./types";
       export const local = 1;`,
    );

    expect(readImportSpecifiers(path).sort()).toEqual(["./all", "./named", "./namespaced"]);
  });

  it("reads a dynamic import written as a literal", () => {
    const path = file("a.ts", `export const load = () => import("./lazy");`);

    expect(readImportSpecifiers(path)).toEqual(["./lazy"]);
  });

  it("reads a dynamic import written with single quotes or a plain template", () => {
    const path = file(
      "a.ts",
      ["const a = import('./single');", "const b = import(`./template`);"].join("\n"),
    );

    expect(readImportSpecifiers(path).sort()).toEqual(["./single", "./template"]);
  });

  it("skips a dynamic import whose specifier is computed", () => {
    const path = file(
      "a.ts",
      // biome-ignore lint/suspicious/noTemplateCurlyInString: the template is the fixture's source code, written out as text
      ["const a = import(name);", "const b = import(`./${name}`);"].join("\n"),
    );

    expect(readImportSpecifiers(path)).toEqual([]);
  });

  it("reads through TypeScript syntax the runtime never sees, keeping an import that brings a value", () => {
    const path = file(
      "a.ts",
      `import type { A } from "./a";
       import { type B, c } from "./b";
       export interface Shape { value: A }
       export const enum E { One }
       declare module "./ambient" {}
       const x = <T,>(v: T): T => v satisfies T;`,
    );

    expect(readImportSpecifiers(path).sort()).toEqual(["./b"]);
  });

  it("reads JSX from a .tsx file", () => {
    const path = file(
      "a.tsx",
      `import { Widget } from "./widget";
       export const View = () => <Widget attr={1 < 2} />;`,
    );

    expect(readImportSpecifiers(path)).toEqual(["./widget"]);
  });

  it("still reports the imports it found in a file that does not parse", () => {
    const path = file("a.ts", `import { a } from "./a";\nexport const broken = (;`);

    expect(readImportSpecifiers(path)).toContain("./a");
  });

  it("returns nothing for a file it cannot read, and says it could not read it", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(readModuleImports(join(dir, "missing.ts"))).toEqual({
      contentHash: "unreadable",
      specifiers: [],
    });
  });

  it("hashes the raw bytes it parsed", () => {
    const bytes = Buffer.from([...Buffer.from('import "./a";\n// caf'), 0xe9, 0x0a]);
    const path = join(dir, "latin1.ts");
    writeFileSync(path, bytes);

    const imports = readModuleImports(path);

    expect(imports.contentHash).toBe(createHash("sha256").update(bytes).digest("hex"));
    expect(imports.specifiers).toEqual(["./a"]);
  });

  it("parses an unchanged file once, and again after it changes", () => {
    const path = file("a.ts", `import { a } from "./a";`);
    const parses = () => vi.mocked(parseSync).mock.calls.filter(([name]) => name === path).length;

    readModuleImports(path);
    const second = readModuleImports(path);
    expect(parses()).toBe(1);
    expect(second.specifiers).toEqual(["./a"]);

    writeFileSync(path, `import { b } from "./b";`);
    const changed = readModuleImports(path);

    expect(parses()).toBe(2);
    expect(changed.specifiers).toEqual(["./b"]);
  });

  it("parses a file that parses only in part once too", () => {
    const path = file("a.ts", `import { a } from "./a";\nexport const broken = (;`);
    const parses = () => vi.mocked(parseSync).mock.calls.filter(([name]) => name === path).length;

    readModuleImports(path);
    readModuleImports(path);

    expect(parses()).toBe(1);
    expect(readModuleImports(path).specifiers).toContain("./a");
  });
});
