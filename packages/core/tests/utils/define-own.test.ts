/**
 * A record is given a key of its own whatever the key: `__proto__`, which
 * assigned sets the record's prototype, and every other key, which
 * assigned is the record's own already and costs a tenth of defining it.
 */
import { describe, expect, it } from "vitest";

import { defineOwn } from "../../src/utils/define-own";

describe("defineOwn", () => {
  it("gives a record a key __proto__ of its own, its prototype left as it was", () => {
    const record: Record<string, unknown> = {};

    defineOwn(record, "__proto__", { polluted: true });

    expect(Object.getOwnPropertyDescriptor(record, "__proto__")).toEqual({
      value: { polluted: true },
      enumerable: true,
      writable: true,
      configurable: true,
    });
    expect(Object.getPrototypeOf(record)).toBe(Object.prototype);
  });

  it("gives a record a name every object inherits as a key of its own, as any other", () => {
    const record: Record<string, unknown> = {};

    defineOwn(record, "constructor", "c");
    defineOwn(record, "toString", "t");
    defineOwn(record, "id", 1);

    expect(Object.keys(record)).toEqual(["constructor", "toString", "id"]);
    expect(Object.getOwnPropertyDescriptor(record, "toString")).toEqual({
      value: "t",
      enumerable: true,
      writable: true,
      configurable: true,
    });
  });

  it("gives a key again in its place, the record's own whether it has a prototype or not", () => {
    const record: Record<string, unknown> = { a: 1 };
    const bare: Record<string, unknown> = Object.create(null);

    defineOwn(record, "b", 2);
    defineOwn(record, "a", 3);
    defineOwn(bare, "__proto__", 4);
    defineOwn(bare, "x", 5);

    expect(Object.entries(record)).toEqual([
      ["a", 3],
      ["b", 2],
    ]);
    expect(Object.entries(bare)).toEqual([
      ["__proto__", 4],
      ["x", 5],
    ]);
  });
});
