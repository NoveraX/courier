import { describe, expect, it } from "vitest";

import { closingRun } from "../../../src/server/mocks-edit/plan/closing-run";

describe("closingRun", () => {
  it("reports a brace on its own line as a block, with where its line starts", () => {
    const text = "{\n  a,\n  }";

    expect(closingRun(text, text.length - 1)).toEqual({ start: 6, block: true, lineStart: 7 });
  });

  it("reports a brace after spaces on the item's line as inline", () => {
    const text = "{ a  }";

    expect(closingRun(text, 5)).toEqual({ start: 3, block: false, lineStart: 5 });
  });

  it("reports a brace right after the item as inline with an empty run", () => {
    expect(closingRun("{a}", 2)).toEqual({ start: 2, block: false, lineStart: 2 });
  });

  it("reads CRLF as a line break", () => {
    const text = "{\r\n}";

    expect(closingRun(text, 3)).toEqual({ start: 1, block: true, lineStart: 3 });
  });

  it.each([
    ["a lone CR", "\r"],
    ["U+2028", "\u2028"],
    ["U+2029", "\u2029"],
  ])("reads %s as a line break", (_what, terminator) => {
    const text = `{ // c${terminator}  }`;

    expect(closingRun(text, text.length - 1)).toEqual({ start: 6, block: true, lineStart: 7 });
  });

  it("starts the brace's line after the last line break of the run", () => {
    const text = "{ a,\n\r  }";

    expect(closingRun(text, text.length - 1)).toEqual({ start: 4, block: true, lineStart: 6 });
  });

  it("stops at a comment before the brace", () => {
    const text = "{ a /* c */ }";

    expect(closingRun(text, text.length - 1)).toEqual({ start: 11, block: false, lineStart: 12 });
  });
});
