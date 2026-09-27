import { describe, expect, it } from "vitest";
import { resolveImportLayout } from "../../src/apis/layout/import-layout";
import { InvalidImportError } from "../../src/apis/layout/invalid-import-error";

function refusal(sourceName: string | undefined, importName: string): unknown {
  try {
    resolveImportLayout({ outputDir: "src/api", sourceName }, importName);
  } catch (error) {
    return error;
  }
  return null;
}

describe("resolveImportLayout", () => {
  it("names the source after the import's key when no sourceName is declared", () => {
    const layout = resolveImportLayout({ outputDir: "src/api" }, "petStore");

    expect(layout.sourceBinding).toBe("petStore");
    expect(layout.dir).toBe("src/api/pet-store");
    expect(layout.sourceFile).toBe("src/api/pet-store/source.ts");
  });

  it("names the source after the declared sourceName when there is one", () => {
    const layout = resolveImportLayout({ outputDir: "src/api", sourceName: "shop" }, "pets");

    expect(layout.sourceBinding).toBe("shop");
    expect(layout.dir).toBe("src/api/shop");
  });

  it("lays out every file under the import's own directory in the canonical spelling", () => {
    const layout = resolveImportLayout({ outputDir: "./src//api/" }, "pets");

    expect([
      layout.indexFile,
      layout.schemaFile("schemas"),
      layout.groupDir("webHooks"),
      layout.groupFile("webHooks"),
      layout.groupSchemaFile("webHooks", "types"),
    ]).toEqual([
      "src/api/pets/index.ts",
      "src/api/pets/schemas.ts",
      "src/api/pets/web-hooks",
      "src/api/pets/web-hooks/index.ts",
      "src/api/pets/web-hooks/types.ts",
    ]);
  });

  it("places an import at the project's top when the output directory is the project", () => {
    expect(resolveImportLayout({ outputDir: "." }, "pets").sourceFile).toBe("pets/source.ts");
  });

  it("refuses a name that holds nothing to name a binding with", () => {
    for (const [sourceName, importName] of [
      ["", "pets"],
      ["..", "pets"],
      [undefined, ""],
      [undefined, "/"],
    ] as const) {
      expect(refusal(sourceName, importName)).toBeInstanceOf(InvalidImportError);
    }
  });

  it("renames a source named like something the generated files use, as for a reserved word", () => {
    const layout = resolveImportLayout({ outputDir: "src/api" }, "courier");

    expect(layout.sourceBinding).toBe("courierGroup");
    expect(layout.dir).toBe("src/api/courier-group");
  });

  it("checks only the name the source takes", () => {
    const layout = resolveImportLayout({ outputDir: "src/api", sourceName: "nihon" }, "日本");

    expect(layout.sourceBinding).toBe("nihon");
    expect(refusal("", "pets")).toMatchObject({ field: "sourceName" });
    expect(refusal(undefined, "")).toMatchObject({ field: "importName" });
  });

  it("refuses a group name that is not a binding, so no group is the import's own directory", () => {
    const layout = resolveImportLayout({ outputDir: "src/api" }, "pets");

    for (const group of ["", ".", "pets/..", "../../lib", "a b", "a-b"]) {
      expect(() => layout.groupFile(group)).toThrow(InvalidImportError);
      expect(() => layout.groupDir(group)).toThrow(expect.objectContaining({ field: "group" }));
    }
  });

  it("gives the specifier a file in the import's directory imports a group module by", () => {
    const layout = resolveImportLayout({ outputDir: "src/api" }, "pets");

    expect(layout.groupSpecifier("webHooks", "index")).toBe("./web-hooks/index");
    expect(layout.groupSpecifier("webHooks", "schemas")).toBe("./web-hooks/schemas");
  });
});
