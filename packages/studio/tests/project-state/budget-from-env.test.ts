/**
 * A budget an environment variable may set: a whole number of milliseconds
 * is used, anything else is ignored with one warning that names the
 * variable and is kept for the banner, and an unset or empty variable leaves
 * the default.
 */
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from "vitest";
import { EDIT_FINISH_BUDGET_MS } from "../../src/server/mocks-edit/edit-timing";
import { budgetFromEnv } from "../../src/server/project-state/budget-from-env";
import { CONFIG_LOAD_TIMEOUT_MS, CONFIG_LOAD_TIMEOUT_VARIABLE } from "../../src/server/project-state/budgets";
import { clearStartupIssues, startupIssues } from "../../src/server/startup-issues";

const NAME = "COURIER_CONFIG_LOAD_TIMEOUT_MS";

let warn: MockInstance<typeof console.warn>;

beforeEach(() => {
  clearStartupIssues();
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  clearStartupIssues();
  vi.restoreAllMocks();
});

function warnings(): string[] {
  return warn.mock.calls.map((call) => call.slice(1).join(" "));
}

describe("budgetFromEnv", () => {
  it("uses a whole number of milliseconds the variable holds", () => {
    expect(budgetFromEnv(NAME, 20_000, { [NAME]: "60000" })).toBe(60_000);
    expect(budgetFromEnv(NAME, 20_000, { [NAME]: " 45000 " })).toBe(45_000);
    expect(warn).not.toHaveBeenCalled();
  });

  it("leaves the default, silently, when the variable is unset or empty", () => {
    expect(budgetFromEnv(NAME, 20_000, {})).toBe(20_000);
    expect(budgetFromEnv(NAME, 20_000, { [NAME]: "" })).toBe(20_000);
    expect(warn).not.toHaveBeenCalled();
    expect(startupIssues()).toEqual([]);
  });

  it("keeps the warning for an invalid value for the banner, which would otherwise clear it", () => {
    budgetFromEnv(NAME, 20_000, { [NAME]: "60s" });

    expect(warn).toHaveBeenCalledOnce();
    expect(startupIssues()).toHaveLength(1);
    expect(startupIssues()[0]).toContain(`Ignoring ${NAME}="60s"`);
    expect(startupIssues()[0]).toContain("Using 20000");
  });

  it.each(["soon", "0", "-5", "1.5", "2e4", "0x10", "86400001"])(
    "an invalid COURIER_CONFIG_LOAD_TIMEOUT_MS is ignored with a warning (%s)",
    (value) => {
      const budget = budgetFromEnv(NAME, 20_000, { [NAME]: value });

      expect(budget).toBe(20_000);
      expect(warn).toHaveBeenCalledOnce();
      expect(warnings()[0]).toContain(`${NAME}=${JSON.stringify(value)}`);
    },
  );
});

describe("the load budgets", () => {
  it("name the variable that sets the load timeout, and let an edit finish its load and its undo", () => {
    expect(CONFIG_LOAD_TIMEOUT_VARIABLE).toBe(NAME);
    expect(EDIT_FINISH_BUDGET_MS).toBe(CONFIG_LOAD_TIMEOUT_MS + 5_000);
  });
});
