/**
 * Why Studio could not generate code from a specification a request sent:
 * the generator's own message, or — where it ran out of stack — that the
 * specification nests its schemas deeper than the generator goes, which
 * read before as "Maximum call stack size exceeded".
 */
import { describe, expect, it } from "vitest";

import { SpecGenerationError } from "../src/server/spec-generation-error";

describe("SpecGenerationError", () => {
  it("says a specification nests too deep where the generator ran out of stack", () => {
    expect(
      new SpecGenerationError(new RangeError("Maximum call stack size exceeded")).message,
    ).toBe(
      "Studio could not generate code from this spec: it nests its schemas deeper than Studio can generate code for",
    );
  });

  it("gives the generator's own message otherwise, and is answered 400", () => {
    const error = new SpecGenerationError(new TypeError("required is not iterable"));

    expect(error.message).toBe(
      "Studio could not generate code from this spec: required is not iterable",
    );
    expect(error).toMatchObject({ code: "SPEC_NOT_GENERATED", httpStatus: 400 });
  });
});
