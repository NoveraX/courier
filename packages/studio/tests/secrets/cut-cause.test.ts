/**
 * Why a request got no answer, as it leaves Studio's token page: its text
 * cut short with no half of a character left at the cut, and its
 * credentials cut.
 */
import { describe, expect, it } from "vitest";

import { cutCause } from "../../src/server/secrets/cut-cause";

/* A character UTF-16 writes as two code units, built from its code point. */
const TWO_UNITS = String.fromCodePoint(0x1f600);

describe("cutCause", () => {
  it("leaves no half of a character where the text is cut", () => {
    const cause = cutCause({ code: "ECONNRESET", message: `${"x".repeat(299)}${TWO_UNITS} tail` });

    expect(cause).toEqual({ code: "ECONNRESET", message: "x".repeat(299) });
  });

  it("cuts the credentials in an address it names", () => {
    expect(
      cutCause({ code: "ECONNREFUSED", message: "connect https://u:pw@api.test/x?token=t0k3n" }),
    ).toEqual({ code: "ECONNREFUSED", message: "connect https://api.test/x?token=[redacted]" });
  });
});
