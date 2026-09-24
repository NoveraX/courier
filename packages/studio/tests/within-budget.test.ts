import { describe, expect, it } from "vitest";

import { withinBudget } from "../src/server/within-budget";

describe("withinBudget", () => {
  it("says the work settled when it does in time, also by failing", async () => {
    expect(await withinBudget(Promise.resolve("done"), 1000)).toBe(true);
    expect(await withinBudget(Promise.reject(new Error("failed")), 1000)).toBe(true);
  });

  it("stops waiting when the budget runs out first", async () => {
    const never = new Promise(() => {});

    expect(await withinBudget(never, 20)).toBe(false);
  });
});
