/**
 * The `agents` policy as the config writes it: its defaults, what it
 * refuses where the project is read, and how a server's start may narrow
 * it but never widen it.
 */
import { describe, expect, it } from "vitest";

import { checkedPolicy, MARKED_ONLY, narrowedPolicy } from "../../src/policy/checked-policy";

describe("the agents policy", () => {
  it("offers the endpoints marked .agent() alone when the config sets none", () => {
    expect(checkedPolicy(undefined)).toBe(MARKED_ONLY);
    expect(MARKED_ONLY).toMatchObject({
      offer: "marked",
      access: "destructive",
      confirm: "destructive",
      allow: [],
      deny: [],
    });
  });

  it("fills in what the config leaves out, and keeps what it writes", () => {
    const policy = checkedPolicy({ offer: "reads", deny: ["billing.**"], confirm: "write" });

    expect(policy).toMatchObject({ offer: "reads", access: "destructive", confirm: "write" });
    expect(policy.deny.map((pattern) => [pattern.text, pattern.where])).toEqual([
      ["billing.**", "agents.deny"],
    ]);
    expect(Object.isFrozen(policy)).toBe(true);
  });

  it("refuses a misspelt key or an unknown value, naming where it is", () => {
    const refused: Array<[unknown, string]> = [
      [{ ofer: "reads" }, '"ofer"'],
      [{ offer: "everything" }, "agents.offer"],
      [{ access: "admin" }, "agents.access"],
      [{ confirm: "read" }, "agents.confirm"],
      [{ deny: "billing.**" }, "agents.deny"],
      [{ allow: [""] }, "agents.allow"],
      ["reads", "takes an object"],
    ];

    for (const [given, named] of refused) {
      expect(() => checkedPolicy(given)).toThrow(
        expect.objectContaining({
          code: "AGENT_POLICY_INVALID",
          message: expect.stringContaining(named),
        }),
      );
    }
  });

  it("narrows at a server's start — reads alone, more kept out — and never widens", () => {
    const policy = checkedPolicy({ offer: "all", access: "write", deny: ["billing.**"] });

    const readOnly = narrowedPolicy(policy, { readOnly: true, deny: ["shop.users.*"] });
    const unchanged = narrowedPolicy(checkedPolicy({ access: "read" }), { readOnly: false });

    expect(readOnly.access).toBe("read");
    expect(readOnly.deny.map((pattern) => `${pattern.where} ${pattern.text}`)).toEqual([
      "agents.deny billing.**",
      "--deny shop.users.*",
    ]);
    expect(unchanged.access).toBe("read");
    expect(() => narrowedPolicy(policy, { deny: ["shop..x"] })).toThrow(
      expect.objectContaining({ message: expect.stringContaining("--deny") }),
    );
  });
});
