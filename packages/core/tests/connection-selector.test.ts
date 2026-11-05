/**
 * Which connections a selector names: an id, a list of ids, or fields of
 * their metadata — bounded wherever it comes from, the application or
 * another replica — matched on a connection's own fields only.
 */
import { describe, expect, it } from "vitest";

import { readSelector } from "../src/adapter/connection-selector";

describe("readSelector", () => {
  it("reads a connection id, a list of them, or fields of metadata", () => {
    expect(readSelector("c1")).toEqual({ ids: ["c1"] });
    expect(readSelector({ id: "c1" })).toEqual({ ids: ["c1"] });
    expect(readSelector({ id: ["c1", "c2"] })).toEqual({ ids: ["c1", "c2"] });
    expect(readSelector({ meta: { userId: "u1", admin: true, tier: 2 } })).toEqual({
      fields: [
        ["userId", "u1"],
        ["admin", true],
        ["tier", 2],
      ],
    });
  });

  it("takes as many as 1000 ids and 16 fields", () => {
    const ids = Array.from({ length: 1000 }, (_, i) => `c${i}`);
    const meta = Object.fromEntries(Array.from({ length: 16 }, (_, i) => [`f${i}`, i]));

    expect(readSelector({ id: ids })).toEqual({ ids });
    expect(readSelector({ meta })).toHaveProperty("fields");
  });

  it.each([
    ["nothing", undefined],
    ["null", null],
    ["a number", 42],
    ["an array", ["c1"]],
    ["an empty id", ""],
    ["an id over 128 characters", "x".repeat(129)],
    ["an empty list of ids", { id: [] }],
    ["over 1000 ids", { id: Array.from({ length: 1001 }, (_, i) => `c${i}`) }],
    ["an id that is no string", { id: [7] }],
    ["both ids and metadata", { id: "c1", meta: { userId: "u1" } }],
    ["a field of its own", { tenant: "t1" }],
    ["metadata with no field", { meta: {} }],
    [
      "over 16 fields",
      { meta: Object.fromEntries(Array.from({ length: 17 }, (_, i) => [`f${i}`, i])) },
    ],
    ["a field compared to an object", { meta: { user: { id: "u1" } } }],
    ["a field compared to null", { meta: { userId: null } }],
    ["a field compared to NaN", { meta: { score: Number.NaN } }],
    ["a field compared to Infinity", { meta: { score: Number.POSITIVE_INFINITY } }],
    ["a field compared to a string over 1024 characters", { meta: { note: "x".repeat(1025) } }],
    ["metadata that is an array", { meta: ["userId"] }],
  ])("says why %s names no connection", (_case, value) => {
    expect(readSelector(value)).toBeTypeOf("string");
  });

  it("never repeats what the selector held in why it names nothing", () => {
    const secret = "sk_live_should_not_appear_in_any_message";

    expect(readSelector({ meta: { token: { secret } } })).not.toContain(secret);
    expect(readSelector({ id: [secret.repeat(10)] })).not.toContain(secret);
  });
});
