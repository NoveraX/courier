/**
 * What `courier-studio import` shows before it writes: what is imported
 * and from where, every file the write creates, updates — saying when your
 * edits are kept — replaces, leaves unchanged, removes or keeps, and the
 * steps that wait for consent, by the path `--confirm` takes.
 */
import { createTerminalStyle } from "@noverax/courier/internal";
import { describe, expect, it } from "vitest";

import { parseSpec } from "../../../src/apis";
import { counted, planLines, specLines } from "../../../src/commands/import/plan-lines";
import type { PlanSummary } from "../../../src/server/import-files/plan-summary";

const plain = createTerminalStyle(0, false);

const spec = parseSpec(
  JSON.stringify({
    openapi: "3.0.3",
    info: { title: "Pet Store", version: "1" },
    paths: {
      "/pets": {
        get: { tags: ["pets"], operationId: "listPets", responses: { 200: { description: "ok" } } },
      },
      "/health": { get: { operationId: "health", responses: { 200: { description: "ok" } } } },
      "/debug": { trace: { operationId: "trace", responses: { 200: { description: "ok" } } } },
    },
  }),
);

function plan(more: Partial<PlanSummary>): PlanSummary {
  return {
    digest: "d",
    dir: "src/api/pet-store",
    writes: [],
    removals: [],
    kept: [],
    pending: [],
    blocked: [],
    forgotten: [],
    ...more,
  };
}

describe("what is imported", () => {
  it("names the import, where it came from and what it holds, and each operation it leaves out", () => {
    const lines = specLines("petStore", "./openapi.json", spec, null);

    expect(lines[0]).toBe("Import petStore from ./openapi.json: OpenAPI 3, 2 endpoints in 1 group");
    expect(lines.slice(1)).toEqual([expect.stringMatching(/^ {2}Left out: TRACE \/debug, /)]);
  });

  it("says how many endpoints are picked when not every one is", () => {
    expect(specLines("petStore", "-", spec, { pets: ["listPets"] })[0]).toContain(
      ", 1 of them picked",
    );
  });
});

describe("the files the write changes", () => {
  it("are listed under the import's folder with what happens to each", () => {
    const lines = planLines(
      plan({
        writes: [
          { path: "src/api/pet-store/source.ts", action: "create", was: "absent" },
          { path: "src/api/pet-store/pets/index.ts", action: "merge", was: "recorded-edited" },
          { path: "src/api/pet-store/store/index.ts", action: "merge", was: "recorded" },
          { path: "src/api/pet-store/index.ts", action: "replace", was: "recorded" },
          { path: "src/api/pet-store/schemas.ts", action: "unchanged", was: "recorded" },
        ],
        removals: [{ path: "src/api/pet-store/users/index.ts", was: "recorded" }],
        kept: [{ path: "src/api/pet-store/notes.md", reason: "not-written-by-studio" }],
        formatting: { formattedWith: ["Biome 2.5.14"], problem: null },
      }),
      plain,
    );

    expect(lines).toEqual([
      "Files in src/api/pet-store, formatted with Biome 2.5.14:",
      "  + source.ts",
      "  ~ pets/index.ts  updated, your edits kept",
      "  ~ store/index.ts  updated",
      "  ~ index.ts  replaced",
      "  = schemas.ts  unchanged",
      "  - users/index.ts  removed, a copy kept",
      "    notes.md  kept as it is: not written by Studio",
    ]);
  });

  it("end with the steps that wait for consent, each by its path in the project", () => {
    const lines = planLines(
      plan({
        pending: [
          {
            path: "src/api/pet-store/index.ts",
            kind: "replace",
            reason: "edited",
            preselected: false,
          },
          {
            path: "src/api/pet-store/old.ts",
            kind: "remove",
            reason: "claimed",
            preselected: true,
          },
        ],
        formatting: { formattedWith: [], problem: "Prettier is configured but not installed" },
      }),
      plain,
    );

    expect(lines).toEqual([
      "Files in src/api/pet-store:",
      "  Prettier is configured but not installed",
      "Waiting for your consent:",
      "  replace src/api/pet-store/index.ts: you changed it",
      "  remove src/api/pet-store/old.ts: Studio has no record of writing it",
    ]);
  });
});

describe("a count", () => {
  it("takes the noun for one or for many", () => {
    expect([
      counted(1, "file", "files"),
      counted(0, "file", "files"),
      counted(3, "file", "files"),
    ]).toEqual(["1 file", "0 files", "3 files"]);
  });
});
