/**
 * Consent to an import's plan: with `--yes`, the plan as Import API offers
 * it and the steps `--confirm` names; asked, the plan and then each step
 * waiting for consent; where no one can answer, nothing.
 */
import { describe, expect, it, vi } from "vitest";

import { type ConsentAsk, consentTo } from "../../../src/commands/import/consent";
import type { PlanSummary } from "../../../src/server/import-files/plan-summary";

const plan: PlanSummary = {
  digest: "d",
  dir: "src/api/pets",
  writes: [],
  removals: [],
  kept: [],
  blocked: [],
  forgotten: [],
  pending: [
    { path: "src/api/pets/index.ts", kind: "replace", reason: "edited", preselected: false },
    { path: "src/api/pets/old.ts", kind: "remove", reason: "claimed", preselected: true },
  ],
};

function how(more: Partial<ConsentAsk>): ConsentAsk {
  return {
    yes: false,
    confirm: [],
    interactive: false,
    question: "Write these files?",
    ask: vi.fn(),
    ...more,
  };
}

describe("consent to a plan", () => {
  it("with --yes takes the steps Import API offers ticked and those --confirm names, asking nothing", async () => {
    const ask = vi.fn();

    await expect(consentTo(plan, how({ yes: true, ask }))).resolves.toEqual({
      confirm: ["src/api/pets/old.ts"],
    });
    await expect(
      consentTo(
        plan,
        how({ yes: true, confirm: ["src/api/pets/index.ts", "src/api/pets/old.ts"] }),
      ),
    ).resolves.toEqual({ confirm: ["src/api/pets/old.ts", "src/api/pets/index.ts"] });
    expect(ask).not.toHaveBeenCalled();
  });

  it("is nothing where no one can answer, and nothing when the plan is declined", async () => {
    const declined = vi.fn().mockResolvedValue(false);

    await expect(consentTo(plan, how({}))).resolves.toBeNull();
    await expect(consentTo(plan, how({ interactive: true, ask: declined }))).resolves.toBeNull();
    expect(declined).toHaveBeenCalledOnce();
  });

  it("asks for the plan, then for each waiting step, offering the step's own default", async () => {
    const ask = vi.fn(
      async (question: string) =>
        question === "Write these files?" || question.startsWith("Replace"),
    );

    const answer = await consentTo(plan, how({ interactive: true, ask }));

    expect(answer).toEqual({ confirm: ["src/api/pets/index.ts"] });
    expect(ask.mock.calls).toEqual([
      ["Write these files?", false],
      ["Replace src/api/pets/index.ts?", false],
      ["Remove src/api/pets/old.ts?", true],
    ]);
  });
});
