import { describe, expect, it } from "vitest";

import {
  decoratorLiteral,
  defaultExportLiteral,
  properties,
  propertyLiteral,
} from "../../src/edit/literal";
import { type SourceScan, scanSource } from "../../src/edit/source-scan";

function scanned(text: string): SourceScan {
  const scan = scanSource(text);
  if (scan === undefined) throw new Error("the fixture does not scan");
  return scan;
}

describe("defaultExportLiteral", () => {
  it("finds the object passed to a known config function, written directly, or held by a const", () => {
    const call = scanned("export default defineConfig({ a: 1 })");
    const direct = scanned("export default [1, 2] satisfies X");
    const named = scanned("const config: Config = { a: 1 };\nexport default config;");

    expect(defaultExportLiteral(call, ["defineConfig"])?.open).toBe(call.text.indexOf("{"));
    expect(defaultExportLiteral(direct, [])?.open).toBe(direct.text.indexOf("["));
    expect(defaultExportLiteral(named, [])?.open).toBe(named.text.indexOf("{"));
  });

  it("refuses an unknown function's result", () => {
    expect(
      defaultExportLiteral(scanned("export default other({})"), ["defineConfig"]),
    ).toBeUndefined();
  });
});

describe("properties", () => {
  it("names quoted keys as JSON writes them, past comments", () => {
    const scan = scanned(
      '{\n  // the base\n  "extends": "x",\n  /* options */ "compilerOptions": { "outDir": "dist" }\n}',
    );
    const root = { open: 0, close: scan.text.length - 1 };

    expect(properties(scan, root).map((property) => property.key)).toEqual([
      "extends",
      "compilerOptions",
    ]);
    expect(propertyLiteral(scan, root, "compilerOptions")?.open).toBe(
      scan.text.indexOf('{ "outDir"'),
    );
    expect(propertyLiteral(scan, root, "include")).toBeNull();
    expect(propertyLiteral(scan, root, "extends")).toBeUndefined();
  });
});

describe("decoratorLiteral", () => {
  it("finds the object a decorator is called with", () => {
    const scan = scanned("@Module({ imports: [] })\nexport class AppModule {}");

    expect(decoratorLiteral(scan, "Module")?.open).toBe(scan.text.indexOf("{"));
    expect(decoratorLiteral(scan, "Controller")).toBeUndefined();
  });
});
