/**
 * A thrown value as a JSON log line carries it: an error's name, message,
 * stack, plain fields and cause chain, an AggregateError's errors, anything
 * else as JSON or as its string form — always something JSON.stringify
 * writes, a loop or a BigInt included.
 */
import { describe, expect, it } from "vitest";

import { serializeError } from "../../src/logger/serialize-error";

describe("serializeError", () => {
  it("keeps an error's name, message, stack, plain fields and cause", () => {
    const root = Object.assign(new Error("connect ECONNREFUSED"), {
      code: "ECONNREFUSED",
      port: 4000,
      socket: { fd: 3 },
    });

    const record = serializeError(new TypeError("fetch failed", { cause: root }));

    expect(record).toMatchObject({
      name: "TypeError",
      message: "fetch failed",
      stack: expect.stringContaining("TypeError: fetch failed"),
      cause: { name: "Error", message: "connect ECONNREFUSED", code: "ECONNREFUSED", port: 4000 },
    });
    expect(record).not.toHaveProperty("cause.socket");
  });

  it("keeps an AggregateError's errors", () => {
    const record = serializeError(new AggregateError([new Error("a"), "b"], "both failed"));

    expect(record).toMatchObject({ errors: [{ message: "a" }, "b"] });
  });

  it("ends a cause chain that loops where it repeats", () => {
    const first = new Error("first");
    const second = new Error("second", { cause: first });
    Object.defineProperty(first, "cause", { value: second });

    const text = JSON.stringify(serializeError(first));

    expect(text).toContain('"cause":"Error: first"');
  });

  it("writes a BigInt field as its digits", () => {
    const record = serializeError(Object.assign(new Error("too big"), { limit: 10n ** 20n }));

    expect(JSON.stringify(record)).toContain('"limit":"100000000000000000000"');
  });

  it("keeps a value that is not an error as JSON, or as its string form", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;

    expect(serializeError("ECONNRESET")).toBe("ECONNRESET");
    expect(serializeError({ status: 503 })).toEqual({ value: { status: 503 } });
    expect(serializeError(cyclic)).toBe("[object Object]");
    expect(() => JSON.stringify(serializeError(cyclic))).not.toThrow();
  });
});
