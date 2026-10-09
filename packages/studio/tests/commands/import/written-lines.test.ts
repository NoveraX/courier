/**
 * What `courier-studio import` says once it wrote: the files written —
 * or that none needed writing — those removed and where their copies are,
 * each file kept and why, with how to allow a change you did not allow, and
 * how code calls the API the import declares.
 */
import { describe, expect, it } from "vitest";

import { usageLines, writtenLines } from "../../../src/commands/import/written-lines";
import type { WriteBody, WriteResult } from "../../../src/server/write-types";

function result(more: Partial<WriteResult>): WriteResult {
  return { written: [], removed: [], kept: [], pruneFailures: [], leftBehind: [], ...more };
}

describe("what the write did", () => {
  it("counts the files written and removed, and names each one kept", () => {
    const lines = writtenLines(
      result({
        written: ["a.ts", "b.ts"],
        removed: ["c.ts"],
        backupDir: ".courier/backups/1",
        kept: [
          { path: "src/api/pets/index.ts", reason: "unconfirmed" },
          { path: "src/api/pets/notes.md", reason: "not-written-by-studio" },
        ],
        leftBehind: ["src/old/pets/source.ts"],
        pruneFailures: [{ path: "src/api/pets/users", code: "EACCES" }],
      }),
      "src/api/pets",
    );

    expect(lines).toEqual([
      "Wrote 2 files in src/api/pets.",
      "Removed 1 file; their copies are in .courier/backups/1.",
      "Kept src/api/pets/index.ts as it is; allow the change with --confirm src/api/pets/index.ts",
      "Kept src/api/pets/notes.md as it is: not written by Studio",
      "Left src/old/pets/source.ts where the import was before.",
      "Could not remove the emptied folder src/api/pets/users (EACCES).",
    ]);
  });

  it("says when no file needed writing, and when none was written because a step was not allowed", () => {
    expect(writtenLines(result({}), "src/api/pets")).toEqual([
      "Every file in src/api/pets already holds what the specification gives it.",
    ]);
    expect(
      writtenLines(result({ kept: [{ path: "x.ts", reason: "unconfirmed" }] }), "src/api/pets")[0],
    ).toBe("Wrote no file in src/api/pets.");
  });
});

describe("how code calls the import", () => {
  const body = (generateClient: "direct" | "proxy" | "both" | "none") =>
    ({
      sourceName: "petStore",
      spec: {
        title: "",
        version: "",
        description: "",
        baseURL: "",
        format: "openapi3",
        groups: [],
        schemas: {},
        securitySchemes: [],
        skipped: [],
      },
      options: { type: "openapi", outputDir: "src/api", generateClient },
    }) satisfies WriteBody;

  it("names the callers generated, from the files that export them", () => {
    expect(usageLines(body("direct"))).toEqual([
      'Call it: import { petStoreApi } from "./src/api/pet-store"',
    ]);
    expect(usageLines(body("both"))).toEqual([
      'Call it: import { petStoreApi } from "./src/api/pet-store"',
      'From the browser: import { petStoreProxyApi } from "./src/api/pet-store/proxy"',
    ]);
    expect(usageLines(body("none"))).toEqual([]);
  });
});
