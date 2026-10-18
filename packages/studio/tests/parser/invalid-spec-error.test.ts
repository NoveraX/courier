/**
 * A refusal says where the value was and what it was: a string quoted and
 * cut when long, anything else told by its kind and never asked for text —
 * a value sent to Studio may refuse that, or nest past the stack — and a
 * long path cut in its middle.
 */
import { describe, expect, it } from "vitest";

import { InvalidSpecError } from "../../src/apis/parser/invalid-spec-error";

describe("InvalidSpecError", () => {
  it("quotes a string, cut past 40 characters, and is answered 400", () => {
    const error = new InvalidSpecError("schemas", "x".repeat(50), "it is long");

    expect(error.message).toBe(
      `The specification's schemas "${"x".repeat(40)}…" is refused: it is long.`,
    );
    expect(error.refusal).toBe(`schemas "${"x".repeat(40)}…" is refused: it is long`);
    expect(error).toMatchObject({ code: "INVALID_SPEC", httpStatus: 400, field: "schemas" });
  });

  it.each([
    ["a number", 1.5, "1.5"],
    ["a flag", true, "true"],
    ["null", null, "null"],
    ["nothing", undefined, "undefined"],
    ["a big integer", 10n, "10"],
    ["a symbol", Symbol("s"), "Symbol(s)"],
    ["an object refusing to be text", { toString: 1 }, "{…}"],
    ["an object of no prototype", Object.create(null), "{…}"],
    ["a list", [1, 2], "[…]"],
    ["a function", () => 1, "a function"],
  ])("shows %s as it is, or by its kind", (_label, value, shown) => {
    expect(new InvalidSpecError("a", value, "r").message).toBe(
      `The specification's a ${shown} is refused: r.`,
    );
  });

  it("tells a list nested past the stack by its kind", () => {
    let nested: unknown = [];
    for (let level = 0; level < 100_000; level++) nested = [nested];

    expect(new InvalidSpecError("a", nested, "r").message).toBe(
      "The specification's a […] is refused: r.",
    );
  });

  it("cuts a long path in its middle, and keeps it whole as its field", () => {
    const field = `schemas.${"A".repeat(300)}.refName`;
    const error = new InvalidSpecError(field, "x", "r");

    expect(error.field).toBe(field);
    expect(error.message).toBe(
      `The specification's ${field.slice(0, 80)}…${field.slice(-80)} "x" is refused: r.`,
    );
  });

  it("carries the place and the value as the message shows them, for whatever logs it", () => {
    const field = `schemas.${"A".repeat(300)}.refName`;

    expect(new InvalidSpecError(field, { toString: 1 }, "r").context).toEqual({
      field: `${field.slice(0, 80)}…${field.slice(-80)}`,
      value: "{…}",
    });
  });
});
