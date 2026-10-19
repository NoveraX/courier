/**
 * A file plan read from Studio's answer: every field checked, and a plan
 * with any malformed part not read at all. The consent to a plan starts
 * with the steps Studio offers ticked, and a plan with blocked files is
 * never quoted.
 */
import { describe, expect, it } from "vitest";

import { consentBody, consentFor, toggleConfirmed } from "../src/features/apis/plan-consent";
import { readFilePlan } from "../src/features/apis/read-file-plan";

const PLAN = {
  digest: "plan-1",
  dir: "src/api/pets",
  writes: [{ path: "src/api/pets/source.ts", action: "merge", was: "recorded-edited" }],
  removals: [{ path: "src/api/pets/old/index.ts", was: "recorded" }],
  kept: [{ path: "src/api/pets/helpers.ts", reason: "not-written-by-studio" }],
  pending: [
    { path: "src/api/pets/index.ts", kind: "replace", reason: "foreign", preselected: false },
    { path: "src/api/pets/gone/index.ts", kind: "remove", reason: "claimed", preselected: true },
  ],
  blocked: [],
  forgotten: ["src/api/pets/lost.ts"],
};

describe("readFilePlan", () => {
  it("reads a plan as Studio sends it", () => {
    expect(readFilePlan(PLAN)).toEqual(PLAN);
  });

  it("reads the steps whose allowing removes a file kept as imported", () => {
    const kept = [
      {
        path: "src/api/pets/schemas.ts",
        reason: "imported",
        unless: ["src/api/pets/gone/index.ts"],
      },
    ];

    expect(readFilePlan({ ...PLAN, kept })?.kept).toEqual(kept);
  });

  it("reads nothing when any part is malformed", () => {
    const malformed: unknown[] = [
      { ...PLAN, digest: "" },
      { ...PLAN, writes: [{ path: "a.ts", action: "delete", was: "recorded" }] },
      { ...PLAN, pending: [{ path: "a.ts", kind: "replace", reason: "foreign" }] },
      { ...PLAN, kept: [{ path: "", reason: "edited" }] },
      { ...PLAN, kept: [{ path: "a.ts", reason: "imported", unless: [] }] },
      { ...PLAN, kept: [{ path: "a.ts", reason: "imported", unless: ["b.ts", 1] }] },
      { ...PLAN, blocked: "none" },
      { ...PLAN, forgotten: ["a.ts", 4] },
      JSON.parse('{"__proto__": {"digest": "x"}}'),
      null,
    ];

    for (const raw of malformed) expect(readFilePlan(raw)).toBeNull();
  });
});

describe("consent to a plan", () => {
  it("starts with the steps Studio offers ticked, and toggles only steps the plan holds", () => {
    const plan = readFilePlan(PLAN);
    if (plan === null) throw new Error("the plan did not read");

    const consent = consentFor(plan);
    const allowed = toggleConfirmed(consent, "src/api/pets/index.ts");
    const withdrawn = toggleConfirmed(allowed, "src/api/pets/gone/index.ts");

    expect(consent.confirmed).toEqual(["src/api/pets/gone/index.ts"]);
    expect(withdrawn.confirmed).toEqual(["src/api/pets/index.ts"]);
    expect(toggleConfirmed(consent, "package.json")).toBe(consent);
  });

  it("reads how the files were formatted, and leaves out what does not read", () => {
    const formatting = {
      formattedWith: ["Biome 2.5.14", 3],
      problem: "src/a.ts was not formatted",
    };

    expect(readFilePlan({ ...PLAN, formatting })?.formatting).toEqual({
      formattedWith: ["Biome 2.5.14"],
      problem: "src/a.ts was not formatted",
    });
    expect(readFilePlan({ ...PLAN, formatting: "Biome" })).not.toHaveProperty("formatting");
    expect(readFilePlan(PLAN)).not.toHaveProperty("formatting");
  });

  it("quotes the plan and the steps allowed, but never a plan with blocked files", () => {
    const plan = readFilePlan(PLAN);
    if (plan === null) throw new Error("the plan did not read");
    const blocked = { ...plan, blocked: [{ path: "src/api/pets", reason: "link" as const }] };

    expect(consentBody(consentFor(plan))).toEqual({
      planDigest: "plan-1",
      confirm: ["src/api/pets/gone/index.ts"],
    });
    expect(consentBody(consentFor(blocked))).toEqual({});
    expect(consentBody(null)).toEqual({});
  });
});
