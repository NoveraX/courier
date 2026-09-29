import { afterEach, describe, expect, it, vi } from "vitest";
import { MocksEditRefusal } from "../../../src/server/mocks-edit/mocks-edit-refusal";
import { rejectPlan } from "../../../src/server/mocks-edit/plan/reject-plan";
import type { PlannedInsertion } from "../../../src/server/mocks-edit/plan/types";

const PLAN: PlannedInsertion = {
  fileName: "courier.mocks.ts",
  oldText: "",
  literalKeys: [],
  entries: [
    { key: "api", fields: [] },
    { key: "billing", fields: [] },
  ],
  serverCallee: "defineMockServer",
  configLocal: "courierConfig",
  configSpecifiers: [],
  configForm: "default",
  addedStatements: [],
  extendedImport: null,
};

describe("rejectPlan", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs the problem with the keys planned, and refuses with it", () => {
    const logged: string[] = [];
    vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      logged.push(args.map(String).join(" "));
    });
    let caught: unknown;

    try {
      rejectPlan(PLAN, "something did not hold");
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(MocksEditRefusal);
    expect((caught as MocksEditRefusal).code).toBe("INTERNAL_PLAN_REJECTED");
    expect((caught as MocksEditRefusal).message).toBe(
      "Studio could not verify its edit of courier.mocks.ts (something did not hold), so it changed nothing.",
    );
    expect(logged).toHaveLength(1);
    expect(logged[0]).toContain(
      "The planned edit of courier.mocks.ts adding api, billing failed its check: something did not hold",
    );
  });
});
