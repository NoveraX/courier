/**
 * Why a request got no answer, read in the shape the runtime gives it,
 * wherever it comes from: a text cut to 300 characters, and a code kept
 * only where it reads as a system error code — Node's, undici's, or Bun's
 * in PascalCase.
 */
import { describe, expect, it } from "vitest";

import { readCause } from "../src/events/read-cause";

/* A character UTF-16 writes as two code units, built from its code point. */
const TWO_UNITS = String.fromCodePoint(0x1f600);

describe("readCause", () => {
  it("keeps a system error code in any of the forms the platforms write", () => {
    expect(
      ["ECONNREFUSED", "UND_ERR_SOCKET", "ConnectionRefused", "TIMEOUT"].map(
        (code) => readCause({ code, message: "refused" })?.code,
      ),
    ).toEqual(["ECONNREFUSED", "UND_ERR_SOCKET", "ConnectionRefused", "TIMEOUT"]);
  });

  it("drops a code that is no system's, and keeps the text", () => {
    expect(readCause({ code: "Bearer abc", message: "failed" })).toEqual({ message: "failed" });
    expect(readCause({ code: "undefined", message: "failed" })).toEqual({ message: "failed" });
  });

  it("never ends the text it cuts in half a character", () => {
    const message = `${"x".repeat(299)}${TWO_UNITS} and more`;

    expect(readCause({ message })?.message).toBe("x".repeat(299));
    expect(readCause({ message: `${"x".repeat(298)}${TWO_UNITS} and more` })?.message).toBe(
      `${"x".repeat(298)}${TWO_UNITS}`,
    );
  });

  it("cuts the text to 300 characters, and reads no cause without one", () => {
    expect(readCause({ message: "x".repeat(400) })?.message).toHaveLength(300);
    expect([readCause({ message: "" }), readCause(7), readCause(null)]).toEqual([
      undefined,
      undefined,
      undefined,
    ]);
  });
});
