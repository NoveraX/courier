/**
 * What the UI is shown of a plan before it is applied: a file the plan
 * would remove that a file staying imports is shown kept, as the apply
 * keeps it, so the preview no longer promises a removal the apply skips.
 * One kept only because a file whose removal waits for consent imports it
 * names those steps: the apply removes it once they are allowed, where the
 * preview said it stayed.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { projectRootAt } from "@noverax/courier-cli/devkit";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { FilePlan } from "../../src/server/import-files/file-plan-types";
import { keepImported } from "../../src/server/import-files/keep-imported";
import { previewSummary } from "../../src/server/import-files/preview-summary";
import { withConfirmations } from "../../src/server/import-files/with-confirmations";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "courier-preview-summary-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function file(path: string, content: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
}

function plan(sourceBody: string): FilePlan {
  return {
    importName: "shop",
    dir: "src/api/shop",
    writes: [
      {
        path: "src/api/shop/source.ts",
        action: "merge",
        body: sourceBody,
        endpoints: {},
        carriesEdits: false,
        was: "recorded",
      },
    ],
    removals: [{ path: "src/api/shop/store/index.ts", was: "recorded", priorSha256: "0" }],
    kept: [],
    pending: [],
    forgotten: [],
    blocked: [],
    digest: "d",
  };
}

describe("previewSummary", () => {
  it("shows kept a removal a file staying imports, as the apply keeps it", () => {
    file("src/api/shop/store/index.ts", "export const store = {};\n");

    const summary = previewSummary(
      projectRootAt(root),
      plan('import { store } from "./store/index";\n'),
    );

    expect(summary.removals).toEqual([]);
    expect(summary.kept).toEqual([{ path: "src/api/shop/store/index.ts", reason: "imported" }]);
    expect(summary.digest).toBe("d");
  });

  it("shows a removal nothing staying imports as a removal", () => {
    file("src/api/shop/store/index.ts", "export const store = {};\n");

    const summary = previewSummary(projectRootAt(root), plan("export const shop = {};\n"));

    expect(summary.removals).toEqual([{ path: "src/api/shop/store/index.ts", was: "recorded" }]);
  });

  it("names the steps waiting for consent whose allowing removes a file kept as imported", () => {
    file("src/api/shop/store/schemas.ts", "export const StoreSchema = {};\n");
    file("src/api/shop/store/index.ts", 'import { StoreSchema } from "./schemas";\n');
    file("src/api/shop/pets/index.ts", 'import { StoreSchema } from "../store/schemas";\n');
    const waiting = (path: string) => ({
      confirmation: {
        path,
        kind: "remove" as const,
        reason: "edited" as const,
        preselected: false,
      },
      removal: { path, was: "recorded-edited" as const, priorSha256: "1" },
    });
    const removing: FilePlan = {
      ...plan("export const shop = {};\n"),
      removals: [{ path: "src/api/shop/store/schemas.ts", was: "recorded", priorSha256: "0" }],
      pending: [waiting("src/api/shop/store/index.ts"), waiting("src/api/shop/pets/index.ts")],
    };

    const summary = previewSummary(projectRootAt(root), removing);
    const applied = (allowed: string[]) =>
      keepImported(projectRootAt(root), withConfirmations(removing, allowed)).removals.map(
        (removal) => removal.path,
      );

    expect(summary.kept).toEqual([
      {
        path: "src/api/shop/store/schemas.ts",
        reason: "imported",
        unless: ["src/api/shop/store/index.ts", "src/api/shop/pets/index.ts"],
      },
    ]);
    expect(applied(["src/api/shop/store/index.ts"])).not.toContain("src/api/shop/store/schemas.ts");
    expect(applied(["src/api/shop/store/index.ts", "src/api/shop/pets/index.ts"])).toContain(
      "src/api/shop/store/schemas.ts",
    );
  });

  it("names no step for a file a file staying whatever is allowed imports", () => {
    file("src/api/shop/store/schemas.ts", "export const StoreSchema = {};\n");
    file("src/api/shop/store/index.ts", 'import { StoreSchema } from "./schemas";\n');
    const removing: FilePlan = {
      ...plan('import { StoreSchema } from "./store/schemas";\n'),
      removals: [{ path: "src/api/shop/store/schemas.ts", was: "recorded", priorSha256: "0" }],
      pending: [
        {
          confirmation: {
            path: "src/api/shop/store/index.ts",
            kind: "remove",
            reason: "edited",
            preselected: false,
          },
          removal: {
            path: "src/api/shop/store/index.ts",
            was: "recorded-edited",
            priorSha256: "1",
          },
        },
      ],
    };

    const summary = previewSummary(projectRootAt(root), removing);

    expect(summary.kept).toEqual([{ path: "src/api/shop/store/schemas.ts", reason: "imported" }]);
  });
});
