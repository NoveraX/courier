/**
 * What the toast says an apply did: an emptied folder Studio could not
 * remove is named, so the user can delete it.
 */
import { describe, expect, it } from "vitest";

import { appliedMessage, countsOf } from "../src/features/apis/applied-notes";

describe("appliedMessage", () => {
  it("names the emptied folders Studio could not remove", () => {
    const applied = {
      written: ["src/api/pets/index.ts"],
      removed: ["src/api/pets/old/index.ts"],
      kept: [],
      backupDir: ".courier/backups/1",
      pruneFailures: [{ path: "src/api/pets/old", code: "EACCES" }],
    };

    expect(appliedMessage("Updated pets", countsOf(applied))).toBe(
      "Updated pets: wrote 1 file; removed 1 file, keeping a copy; could not remove the emptied folder src/api/pets/old; delete it by hand",
    );
  });

  it("says nothing of folders when every emptied one went", () => {
    const applied = {
      written: [],
      removed: ["a.ts"],
      kept: [],
      backupDir: ".courier/backups/1",
      pruneFailures: [],
    };

    expect(appliedMessage("Updated pets", countsOf(applied))).toBe(
      "Updated pets: removed 1 file, keeping a copy",
    );
  });
});
