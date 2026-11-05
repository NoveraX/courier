/**
 * Canonical JSON: equal values read the same whatever order their fields
 * were set in, as JSON would carry them.
 */
import { describe, expect, it } from "vitest";

import { canonicalJson } from "../src/utils/canonical-json";

describe("canonicalJson", () => {
  it("sorts the keys of every object, at any depth, and keeps arrays in order", () => {
    expect(canonicalJson({ b: 1, a: [true, { d: null, c: "x" }] })).toBe(
      '{"a":[true,{"c":"x","d":null}],"b":1}',
    );
  });

  it("reads equal values the same whichever order their fields were set in", () => {
    expect(canonicalJson({ meta: { tier: 2, userId: "u1" }, code: 4001 })).toBe(
      canonicalJson({ code: 4001, meta: { userId: "u1", tier: 2 } }),
    );
  });

  it("leaves out a field set to undefined, as JSON does", () => {
    expect(canonicalJson({ a: 1, b: undefined })).toBe(canonicalJson({ a: 1 }));
    expect(canonicalJson([undefined])).toBe("[null]");
  });

  it("quotes keys and strings, so no value can pass for another field", () => {
    expect(canonicalJson({ a: 'x","b":"y' })).not.toBe(canonicalJson({ a: "x", b: "y" }));
  });
});
