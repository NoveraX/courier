/**
 * A module declares `_ownFields` when the code written into it calls the
 * function, read from that code: a field written as a reference alone, whose
 * specification set an object with a field `constructor` beside the
 * reference, had its module declare a function nothing called, which a
 * project compiling with `noUnusedLocals` refused.
 */
import { describe, expect, it } from "vitest";

import { callsOwnFields } from "../../src/apis/generator/calls-own-fields";

describe("whether code calls _ownFields", () => {
  it("is true for a schema written through it, inside another one too", () => {
    expect(
      callsOwnFields(
        "export const ThingSchema = _ownFields(z.looseObject({ constructor: z.string() }));",
      ),
    ).toBe(true);
    expect(callsOwnFields("(z.array(_ownFields(z.looseObject({ toString: z.string() }))));")).toBe(
      true,
    );
  });

  it("is false for a schema written by reference alone", () => {
    expect(callsOwnFields("export const BoxSchema = z.looseObject({ thing: ThingSchema });")).toBe(
      false,
    );
  });

  it("is false for code that only spells the name: a key, a pattern, a string, a comment, a member", () => {
    expect(
      callsOwnFields(
        [
          "/** Checked as _ownFields(…) checks an object. */",
          'export const KeySchema = z.looseObject({ "_ownFields(x)": z.string() });',
          "export const PatternSchema = z.string().regex(/(_ownFields())/u);",
          'export const ValueSchema = z.enum(["_ownFields()"]);',
          "export const MemberSchema = schemas._ownFields(z.string());",
        ].join("\n"),
      ),
    ).toBe(false);
  });

  it("is false for code that never spells the name", () => {
    expect(callsOwnFields("export const ThingSchema = z.looseObject({ id: z.string() });")).toBe(
      false,
    );
  });
});
