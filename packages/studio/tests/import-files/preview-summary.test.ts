/**
 * What the UI is shown of a plan before it is applied: a file the plan
 * would remove that a file staying imports is shown kept, as the apply
 * keeps it, so the preview no longer promises a removal the apply skips.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { projectRootAt } from "@noverax/courier-cli/devkit";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { FilePlan } from "../../src/server/import-files/file-plan-types";
import { previewSummary } from "../../src/server/import-files/preview-summary";

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
});
