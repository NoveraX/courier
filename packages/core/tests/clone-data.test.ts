/**
 * The copy a cached answer is handed out as. Where the runtime has no
 * `structuredClone` — React Native without Expo — arrays, plain objects,
 * dates, maps and sets are copied, data that refers to itself keeps its
 * shape, and anything else is kept as it is.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { cloneData } from "../src/utils/clone-data";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("cloneData without structuredClone", () => {
  it("copies arrays, plain objects, dates, maps and sets all the way down", () => {
    vi.stubGlobal("structuredClone", undefined);
    const data = {
      users: [{ id: 1, tags: new Set(["admin"]) }],
      seen: new Date(0),
      byId: new Map([[1, { name: "Ada" }]]),
    };

    const copy = cloneData(data);

    expect(copy).toEqual(data);
    expect(copy.users[0]).not.toBe(data.users[0]);
    expect(copy.users[0]?.tags).not.toBe(data.users[0]?.tags);
    expect(copy.seen).not.toBe(data.seen);
    expect(copy.byId.get(1)).not.toBe(data.byId.get(1));
  });

  it("copies data that refers to itself with the same shape", () => {
    vi.stubGlobal("structuredClone", undefined);
    const node: { name: string; self?: unknown } = { name: "root" };
    node.self = node;

    const copy = cloneData(node);

    expect(copy).not.toBe(node);
    expect(copy.self).toBe(copy);
  });

  it("keeps a __proto__ field a field, as JSON.parse made it", () => {
    vi.stubGlobal("structuredClone", undefined);
    const data: unknown = JSON.parse('{"__proto__": {"admin": true}}');

    const copy = cloneData(data) as Record<string, unknown>;

    expect(Object.hasOwn(copy, "__proto__")).toBe(true);
    expect(Object.getPrototypeOf(copy)).toBe(Object.prototype);
  });

  it("keeps a class instance as it is", () => {
    vi.stubGlobal("structuredClone", undefined);
    const blob = new Blob(["x"]);

    expect(cloneData({ blob }).blob).toBe(blob);
  });
});

describe("cloneData with structuredClone", () => {
  it("leaves the copy to it", () => {
    const structuredClone = vi.fn((value: unknown) => ({ copied: value }));
    vi.stubGlobal("structuredClone", structuredClone);

    expect(cloneData({ a: 1 })).toEqual({ copied: { a: 1 } });
    expect(structuredClone).toHaveBeenCalledOnce();
  });
});
