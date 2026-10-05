/**
 * The mock wizard opens where it was left — its step and drafts, kept in
 * the project — and from its first step once it is done or has no drafts.
 */
import { describe, expect, it } from "vitest";

import { keptWizard, readKeptWizard } from "@/features/mocks/wizard/kept-wizard";
import { INITIAL_WIZARD_STATE, mockWizardReducer } from "@/features/mocks/wizard/wizard-reducer";

const picked = mockWizardReducer(INITIAL_WIZARD_STATE, {
  type: "toggleSource",
  source: "billing",
  declaredKeys: [],
});

describe("a mock wizard left unfinished", () => {
  it("keeps its step and drafts, a plan's step as the one before it", () => {
    const configured = mockWizardReducer(picked, { type: "goTo", step: "configure" });

    expect(keptWizard(picked)).toEqual({ step: "source", drafts: picked.drafts });
    expect(keptWizard({ ...configured, step: "review" })).toEqual({
      step: "configure",
      drafts: configured.drafts,
    });
  });

  it("keeps nothing once done, or with no drafts", () => {
    expect(keptWizard(INITIAL_WIZARD_STATE)).toBeNull();
    expect(keptWizard({ ...picked, step: "done" })).toBeNull();
  });

  it("opens where it was left, and from its first step with nothing kept", () => {
    const kept = readKeptWizard(JSON.parse(JSON.stringify(keptWizard(picked))));

    const resumed = mockWizardReducer(INITIAL_WIZARD_STATE, { type: "open", resume: kept });
    const fresh = mockWizardReducer(picked, { type: "open" });

    expect(resumed).toMatchObject({ step: "source", drafts: picked.drafts });
    expect(fresh).toBe(INITIAL_WIZARD_STATE);
  });

  it("reads only drafts of their shape", () => {
    const [draft] = picked.drafts;

    expect(readKeptWizard({ step: "configure", drafts: [draft, { source: 1 }] })).toEqual({
      step: "configure",
      drafts: [draft],
    });
    expect(readKeptWizard({ step: "review", drafts: [draft] })).toBeUndefined();
    expect(readKeptWizard({})).toBeUndefined();
  });
});
