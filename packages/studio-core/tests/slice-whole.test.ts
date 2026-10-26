/**
 * The start of a text cut to a length in code units, which never ends in
 * the first half of a character UTF-16 writes as two.
 */
import { describe, expect, it } from "vitest";

import { sliceWhole } from "../src/lib/slice-whole";

/* A character UTF-16 writes as two code units, built from its code point. */
const TWO_UNITS = String.fromCodePoint(0x1f600);

describe("sliceWhole", () => {
  it("drops the half of a character the cut falls inside", () => {
    expect(sliceWhole(`ab${TWO_UNITS}c`, 3)).toBe("ab");
  });

  it("keeps a character the cut falls after, and a text shorter than the length", () => {
    expect(sliceWhole(`ab${TWO_UNITS}c`, 4)).toBe(`ab${TWO_UNITS}`);
    expect(sliceWhole("abc", 10)).toBe("abc");
  });
});
