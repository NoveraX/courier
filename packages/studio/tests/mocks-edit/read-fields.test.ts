import { describe, expect, it } from "vitest";

import { readFields } from "../../src/server/mocks-edit/read-fields";

describe("reading an object with a fixed set of fields", () => {
  it("returns an object that has exactly the fields", () => {
    const value = { a: 1, b: null };

    expect(readFields(value, "", ["a", "b"])).toEqual({ ok: true, value: { a: 1, b: null } });
  });

  it("accepts an object without a prototype", () => {
    const value = Object.assign(Object.create(null) as object, { a: 1 });

    expect(readFields(value, "mocks[0]", ["a"]).ok).toBe(true);
  });

  it("names the body when the body is not an object", () => {
    expect(readFields([], "", ["a"])).toEqual({
      ok: false,
      message: "the body must be a JSON object",
    });
  });

  it("names the path when a nested value is not an object", () => {
    expect(readFields(null, "mocks[2]", ["a"])).toEqual({
      ok: false,
      message: "mocks[2] must be a JSON object",
    });
  });

  it("refuses a non-enumerable field it does not know", () => {
    const value = Object.defineProperty({ a: 1 }, "hidden", { value: 2, enumerable: false });

    expect(readFields(value, "", ["a"])).toEqual({
      ok: false,
      message: 'the body has an unknown field "hidden"',
    });
  });

  it("refuses an object that inherits from anything but Object", () => {
    const value = Object.create({ a: 1 }) as object;

    expect(readFields(value, "", ["a"])).toEqual({
      ok: false,
      message: "the body must be a JSON object",
    });
  });

  it("names a missing field by its path", () => {
    expect(readFields({ a: 1 }, "mocks[1]", ["a", "b"])).toEqual({
      ok: false,
      message: "mocks[1].b is required",
    });
    expect(readFields({ a: 1 }, "", ["a", "b"])).toEqual({ ok: false, message: "b is required" });
  });
});
