/**
 * The state a confirmation goes out with counts for the call it was asked
 * about alone: the same tool, the same arguments, within five minutes,
 * signed by this server.
 */
import { describe, expect, it } from "vitest";

import { requestStates } from "../../src/protocol/request-state";

const states = requestStates(new Uint8Array(32).fill(1));

describe("a request state", () => {
  it("holds for the call it was sealed for, its arguments in any order", async () => {
    const state = await states.seal("orders_cancel", { id: "7", reason: "late" });

    expect(await states.open(state, "orders_cancel", { reason: "late", id: "7" })).toBeUndefined();
  });

  it("is forged for another tool, other arguments, another key, or a changed byte", async () => {
    const state = await states.seal("orders_cancel", { id: "7" });
    const [version, payload, signature] = state.split(".");
    const otherKey = requestStates(new Uint8Array(32).fill(2));

    expect(await states.open(state, "orders_refund", { id: "7" })).toBe("forged");
    expect(await states.open(state, "orders_cancel", { id: "8" })).toBe("forged");
    expect(await otherKey.open(state, "orders_cancel", { id: "7" })).toBe("forged");
    expect(
      await states.open(`${version}.${payload}x.${signature}`, "orders_cancel", { id: "7" }),
    ).toBe("forged");
    expect(await states.open("not a state", "orders_cancel", { id: "7" })).toBe("forged");
    expect(await states.open(undefined, "orders_cancel", { id: "7" })).toBe("forged");
  });

  it("expires five minutes after it was sealed", async () => {
    const sealedAt = Date.now();
    const state = await states.seal("orders_cancel", { id: "7" }, sealedAt);

    expect(
      await states.open(state, "orders_cancel", { id: "7" }, sealedAt + 4 * 60_000),
    ).toBeUndefined();
    expect(await states.open(state, "orders_cancel", { id: "7" }, sealedAt + 6 * 60_000)).toBe(
      "expired",
    );
  });
});
