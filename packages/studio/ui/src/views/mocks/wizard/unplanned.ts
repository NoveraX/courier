import type { MockWizardState } from "./types";

/** Nothing planned and nothing applied. */
export const UNPLANNED: Pick<MockWizardState, "plan" | "apply"> = {
  plan: { status: "idle" },
  apply: { status: "idle" },
};
