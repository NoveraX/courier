import { describe, expect, it } from "vitest";
import { IMPORTS_STATE_VERSION } from "../src/apis/imports-state";
import type { ImportsSnapshot } from "../src/server/imports-bridge";
import { scannedFilePaths } from "../src/server/scanned-file-paths";

function snapshot(outputDir: string): ImportsSnapshot {
  return {
    declarations: { pets: { importType: "file", type: "openapi", outputDir } },
    state: { version: IMPORTS_STATE_VERSION, imports: {} },
  };
}

describe("scannedFilePaths", () => {
  const WRITTEN = [
    "src/api/pets/store/index.ts",
    "src/api/pets/source.ts",
    "src/api/pets/index.ts",
    "src/api/pets/pets/index.ts",
  ];

  it("finds a group named like its import in the group's own directory, not the barrel", () => {
    const paths = scannedFilePaths(snapshot("src/api"), "pets", WRITTEN);

    expect(paths.group("pets")).toBe("src/api/pets/pets/index.ts");
    expect(paths.group("store")).toBe("src/api/pets/store/index.ts");
    expect(paths.source).toBe("src/api/pets/source.ts");
  });

  it("finds nothing for a group Studio did not write, or a name that is no binding", () => {
    const paths = scannedFilePaths(snapshot("src/api"), "pets", WRITTEN);

    expect(paths.group("orders")).toBe("");
    expect(paths.group("")).toBe("");
  });

  it("matches by name when the declaration is one Studio refuses to lay out", () => {
    const paths = scannedFilePaths(snapshot("node_modules/gen"), "pets", WRITTEN);

    expect(paths.source).toBe("src/api/pets/source.ts");
  });
});
