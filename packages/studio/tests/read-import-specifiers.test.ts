import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { readImportSpecifiers } from "../src/server/read-import-specifiers";

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
  rmSync(dir, { recursive: true, force: true });
});

describe("readImportSpecifiers", () => {
  it("returns nothing for a file that imports nothing", () => {
    expect(readImportSpecifiers(file("a.ts", `export const x = 1;`))).toEqual([]);
  });

  it("reads value, type-only, default, namespace and side-effect imports", () => {
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
      "./type",
      "./value",
    ]);
  });

  it("reads re-export sources and ignores local exports", () => {
    const path = file(
      "a.ts",
      `export { a } from "./named";
       export * from "./all";
       export * as ns from "./namespaced";
       export type { T } from "./types";
       export const local = 1;`,
    );

    expect(readImportSpecifiers(path).sort()).toEqual([
      "./all",
      "./named",
      "./namespaced",
      "./types",
    ]);
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
      ["const a = import(name);", "const b = import(`./${name}`);"].join("\n"),
    );

    expect(readImportSpecifiers(path)).toEqual([]);
  });

  it("reads TypeScript syntax the runtime never sees", () => {
    const path = file(
      "a.ts",
      `import type { A } from "./a";
       import { type B, c } from "./b";
       export interface Shape { value: A }
       export const enum E { One }
       declare module "./ambient" {}
       const x = <T,>(v: T): T => v satisfies T;`,
    );

    expect(readImportSpecifiers(path).sort()).toEqual(["./a", "./b"]);
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

  it("returns nothing for a file it cannot read", () => {
    expect(readImportSpecifiers(join(dir, "missing.ts"))).toEqual([]);
  });
});
