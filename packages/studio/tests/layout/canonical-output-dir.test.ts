import { describe, expect, it } from "vitest";
import { canonicalOutputDir } from "../../src/apis/layout/canonical-output-dir";
import { InvalidImportError } from "../../src/apis/layout/invalid-import-error";

function refusal(raw: string): unknown {
  try {
    canonicalOutputDir(raw);
  } catch (error) {
    return error;
  }
  return null;
}

describe("canonicalOutputDir", () => {
  it("gives every spelling of one directory the same canonical form", () => {
    for (const raw of ["src/api", "./src/api", "src/api/", "src//api", "src\\api", "./src/./api//"]) {
      expect(canonicalOutputDir(raw)).toBe("src/api");
    }
  });

  it("names the project itself as `.`", () => {
    expect(canonicalOutputDir(".")).toBe(".");
    expect(canonicalOutputDir("./")).toBe(".");
    expect(canonicalOutputDir("src/..")).toBe(".");
  });

  it("refuses a directory outside the project", () => {
    for (const raw of ["..", "../lib", "src/../../lib", "/abs/api", "C:\\api", "C:api", "\\\\srv\\share"]) {
      expect(refusal(raw)).toBeInstanceOf(InvalidImportError);
    }
  });

  it("refuses an empty directory, a NUL byte and a stream name", () => {
    for (const raw of ["", "  ", "src/\0api", "src/api:stream"]) {
      expect(refusal(raw)).toBeInstanceOf(InvalidImportError);
    }
  });

  it("refuses directories generated files do not belong in, in any letter case", () => {
    for (const raw of [".git", ".git/hooks", "node_modules/pkg", "src/Node_Modules", ".courier/x"]) {
      expect(refusal(raw)).toMatchObject({ code: "INVALID_IMPORT", field: "outputDir", httpStatus: 400 });
    }
  });

  it("refuses names Windows reads as another name", () => {
    for (const raw of ["src/.git./x", "src/.git /x", "node_modules./x", "src/GIT~1", "src/aux", "src/CON.txt", "src/a|b", "src/a?b"]) {
      expect(refusal(raw)).toBeInstanceOf(InvalidImportError);
    }
  });

  it("puts a name in NFC, so both Unicode spellings of it are one directory", () => {
    expect(canonicalOutputDir("src/cafe\u0301")).toBe(canonicalOutputDir("src/caf\u00e9"));
  });
});
