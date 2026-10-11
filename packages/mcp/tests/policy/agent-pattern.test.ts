/**
 * The patterns of the `agents` policy: what each names by an endpoint's
 * call under its source, and the ones refused where they are written.
 */
import { describe, expect, it } from "vitest";

import { agentPattern } from "../../src/policy/agent-pattern";

function names(pattern: string, paths: readonly string[]): string[] {
  const checked = agentPattern(pattern, "agents.deny");
  return paths.filter((path) => checked.matches(path));
}

const PATHS = [
  "shop.orders.get",
  "shop.orders.cancel",
  "shop.orders.items.list",
  "shop.users.get",
  "billing.charge",
  "billing.invoices.void",
] as const;

describe("an agents pattern", () => {
  it("names one endpoint by its whole call, and nothing longer or shorter", () => {
    expect(names("shop.orders.get", PATHS)).toEqual(["shop.orders.get"]);
    expect(names("shop.orders", PATHS)).toEqual([]);
  });

  it("takes * for any one name, or any part of one", () => {
    expect(names("shop.orders.*", PATHS)).toEqual(["shop.orders.get", "shop.orders.cancel"]);
    expect(names("shop.*.get", PATHS)).toEqual(["shop.orders.get", "shop.users.get"]);
    expect(names("shop.orders.ca*", PATHS)).toEqual(["shop.orders.cancel"]);
  });

  it("takes ** for any number of names, none among them", () => {
    expect(names("billing.**", PATHS)).toEqual(["billing.charge", "billing.invoices.void"]);
    expect(names("shop.**.list", PATHS)).toEqual(["shop.orders.items.list"]);
    expect(names("**.get", PATHS)).toEqual(["shop.orders.get", "shop.users.get"]);
    expect(names("**", PATHS)).toEqual([...PATHS]);
  });

  it("reads regular expression characters as themselves", () => {
    expect(names("shop.orders.g.t", PATHS)).toEqual([]);
    expect(agentPattern("shop.$special(1)", "agents.allow").matches("shop.$special(1)")).toBe(true);
  });

  it("refuses what names no call, where it is written", () => {
    for (const given of ["", "shop..get", "shop. orders", "shop.orders**", 7, null]) {
      expect(() => agentPattern(given, "agents.allow")).toThrow(
        expect.objectContaining({
          code: "AGENT_POLICY_INVALID",
          message: expect.stringContaining("agents.allow"),
        }),
      );
    }
  });
});
