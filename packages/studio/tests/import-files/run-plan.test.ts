/**
 * A plan refused for want of consent, or because the files changed, carries
 * the plan as a preview shows it: a file a file staying imports is shown
 * kept, as the apply keeps it, where the refusal's plan listed it among the
 * removals the apply then skipped.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { projectRootAt } from "@noverax/courier-cli/devkit";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { FilePlanError } from "../../src/server/import-files/file-plan-error";
import type { FilePlan } from "../../src/server/import-files/file-plan-types";
import { runPlan } from "../../src/server/import-files/run-plan";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "courier-run-plan-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function file(path: string, content: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
}

/* The store group goes; its edited index waits for consent, and imports its schemas. */
const PLAN: FilePlan = {
  importName: "shop",
  dir: "src/api/shop",
  writes: [],
  removals: [{ path: "src/api/shop/store/schemas.ts", was: "recorded", priorSha256: "0" }],
  kept: [],
  pending: [
    {
      confirmation: {
        path: "src/api/shop/store/index.ts",
        kind: "remove",
        reason: "edited",
        preselected: false,
      },
      removal: { path: "src/api/shop/store/index.ts", was: "recorded-edited", priorSha256: "1" },
    },
  ],
  forgotten: [],
  blocked: [],
  digest: "d",
};

async function refusal(consent: { planDigest?: string }): Promise<FilePlanError> {
  const refused = await runPlan(projectRootAt(root), PLAN, consent, () => {}, "when-shown").catch(
    (error: unknown) => error,
  );
  if (!(refused instanceof FilePlanError)) throw new Error("the plan was not refused");
  return refused;
}

describe("runPlan, refusing", () => {
  beforeEach(() => {
    file("src/api/shop/store/schemas.ts", "export const StoreSchema = {};\n");
    file("src/api/shop/store/index.ts", 'import { StoreSchema } from "./schemas";\n');
  });

  it("carries the plan a write waits for consent to as a preview shows it", async () => {
    const refused = await refusal({});

    expect(refused.code).toBe("NEEDS_CONFIRMATION");
    expect(refused.plan?.removals).toEqual([]);
    expect(refused.plan?.kept).toEqual([
      {
        path: "src/api/shop/store/schemas.ts",
        reason: "imported",
        unless: ["src/api/shop/store/index.ts"],
      },
    ]);
  });

  it("carries the plan the files changed under as a preview shows it", async () => {
    const refused = await refusal({ planDigest: "seen before" });

    expect(refused.code).toBe("PLAN_STALE");
    expect(refused.plan?.kept.map((entry) => entry.path)).toEqual([
      "src/api/shop/store/schemas.ts",
    ]);
  });
});
