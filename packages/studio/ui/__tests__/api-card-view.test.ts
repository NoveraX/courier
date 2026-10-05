/**
 * An imported API's card: what its update check found, and why when it
 * found nothing — a failed check says why it failed, not a bare "Error",
 * and an import with no URL says it was not checked, not "Up to date" — and
 * the validation library its code is generated with, as Studio lists the
 * import: the default for a declaration that leaves it out.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { apiCardView } from "@/features/apis/api-card-view";
import type { SourceSummary } from "@/features/apis/types";
import { isSourceSummary } from "@/socket/source-list-guards";
import { importsSnapshotOf, summarizeImports } from "../../src/server/imports-bridge";
import { API } from "./playground-fixtures";

let root: string;

function listed(declaration: Record<string, unknown>): SourceSummary {
  const [summary] = summarizeImports(
    importsSnapshotOf(
      { api: { importType: "file", type: "openapi", outputDir: "src/api", ...declaration } },
      root,
    ),
  );
  /* The list reaches the page over the socket as JSON, and passes the page's guard. */
  const registry: unknown = JSON.parse(JSON.stringify(summary));
  if (!isSourceSummary(registry))
    throw new Error("Studio's import summary does not pass the UI's guard");
  return registry;
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "courier-api-card-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("the update check on an import's card", () => {
  it("says it failed, and why", () => {
    const why = "https://pets.example/spec did not answer with a specification Studio can read";

    const view = apiCardView({ ...API, registry: listed({}) }, { status: "error", error: why }, 0);

    expect(view.status.label).toBe("Check failed");
    expect(view.note).toEqual({ tone: "err", text: why });
  });

  it("says an import with no URL was not checked, and why", () => {
    const why = "A file import has no URL to check; upload its specification in Manage to compare.";

    const view = apiCardView(
      { ...API, registry: listed({}) },
      { status: "unchecked", error: why },
      0,
    );

    expect(view.status.label).toBe("Not checked");
    expect(view.check).toEqual({ can: false, why });
  });
});

describe("the validation library on an import's card", () => {
  it("is the default for a declaration that leaves it out", () => {
    const view = apiCardView({ ...API, registry: listed({}) }, undefined, 0);

    expect(view.stats.find((s) => s.label === "Validation")?.value).toBe("zod");
  });

  it("is the one a declaration chooses", () => {
    const view = apiCardView({ ...API, registry: listed({ validation: "valibot" }) }, undefined, 0);

    expect(view.stats.find((s) => s.label === "Validation")?.value).toBe("valibot");
  });
});
