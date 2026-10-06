/**
 * Studio keeps the last update check of each import for every page: up to
 * date while the import was generated from the specification the check
 * read, an update available otherwise, the failure when it failed — and
 * nothing once the import names another URL, or is gone.
 */
import type { CourierImportEntry } from "@noverax/courier/config";
import { describe, expect, it } from "vitest";

import { createUpdateChecks } from "../src/server/update-checks";

const FROM = "https://specs.example/pets.json";
const ENTRY: CourierImportEntry = {
  importType: "url",
  type: "openapi",
  from: FROM,
  outputDir: "src/api",
};

describe("the update checks Studio keeps", () => {
  it("say an update is available until the import is generated from the specification read", () => {
    const checks = createUpdateChecks();
    checks.record("pets", { from: FROM, checkedAt: 1, latestHash: "new" });

    expect(checks.of("pets", ENTRY, "old")).toEqual({ status: "updates-available", checkedAt: 1 });
    expect(checks.of("pets", ENTRY, "new")).toEqual({ status: "up-to-date", checkedAt: 1 });
  });

  it("keep why a check failed", () => {
    const checks = createUpdateChecks();
    checks.record("pets", { from: FROM, checkedAt: 2, error: "502 from the host" });

    expect(checks.of("pets", ENTRY, "old")).toEqual({
      status: "error",
      checkedAt: 2,
      error: "502 from the host",
    });
  });

  it("say nothing of an import whose declaration names another URL than the one checked", () => {
    const checks = createUpdateChecks();
    checks.record("pets", { from: FROM, checkedAt: 1, latestHash: "new" });

    expect(
      checks.of("pets", { ...ENTRY, from: "https://elsewhere.example/pets.json" }, "old"),
    ).toBeUndefined();
    expect(
      checks.of("pets", { importType: "raw", type: "openapi", outputDir: "src/api" }, "old"),
    ).toBeUndefined();
  });

  it("forget an import that is gone, so one named the same later starts unchecked", () => {
    const checks = createUpdateChecks();
    checks.record("pets", { from: FROM, checkedAt: 1, latestHash: "new" });

    checks.forget("pets");

    expect(checks.of("pets", ENTRY, "old")).toBeUndefined();
  });
});
