/**
 * The start of a text cut to a length where a word ends, the word the cut
 * falls inside dropped: half a token is still a token.
 */
import { describe, expect, it } from "vitest";

import { wordsUpTo } from "../../src/utils/words-up-to";

/* A character UTF-16 writes as two code units, built from its code point. */
const TWO_UNITS = String.fromCodePoint(0x1f600);

describe("wordsUpTo", () => {
  it("keeps a text no longer than the length as it is", () => {
    expect(wordsUpTo("pay with tok_live_abc", 21)).toBe("pay with tok_live_abc");
  });

  it("drops the word the cut falls inside, the ellipsis counted in the length", () => {
    expect(wordsUpTo("pay with tok_live_abc", 12)).toBe("pay with…");
  });

  it("keeps a word the cut falls just after", () => {
    expect(wordsUpTo("pay with tok_live_abc", 9)).toBe("pay with…");
  });

  it("keeps no part of a text that is one word", () => {
    expect(wordsUpTo("tok_live_abcdefgh", 8)).toBe("…");
  });

  it("drops a word whose character the cut falls inside", () => {
    expect(wordsUpTo(`pay ab${TWO_UNITS}cd now`, 8)).toBe("pay…");
  });
});
