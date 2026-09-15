import { describe, expect, it } from "vitest";
import { getEffectiveImportDir } from "../src/server/imports-bridge";

describe("getEffectiveImportDir", () => {
  it("joins outputDir with the explicit sourceName when present", () => {
    expect(
      getEffectiveImportDir({ outputDir: "src/api", sourceName: "petstore" }, "whatever"),
    ).toBe("src/api/petstore");
  });

  it("falls back to the import name when sourceName is undefined", () => {
    expect(getEffectiveImportDir({ outputDir: "src/api" }, "petstore")).toBe(
      "src/api/petstore",
    );
  });

  it("strips trailing slashes on outputDir", () => {
    expect(getEffectiveImportDir({ outputDir: "src/api///" }, "petstore")).toBe(
      "src/api/petstore",
    );
  });

  it("never emits 'undefined' segment regardless of inputs", () => {
    const result = getEffectiveImportDir({ outputDir: "src/api" }, "foo");
    expect(result).not.toContain("undefined");
  });
});
