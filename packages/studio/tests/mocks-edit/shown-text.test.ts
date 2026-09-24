import { describe, expect, it } from "vitest";

import { shownText } from "../../src/server/mocks-edit/shown-text";

describe("showing text as a diff does", () => {
  it("drops a byte order mark at the start of the text", () => {
    const text = "\uFEFFa\nb\n";

    expect(shownText(text, [{ start: 0, end: 2 }])).toBe("a");
  });

  it("keeps a byte order mark that is not at the start of the text", () => {
    const text = "a\n\uFEFFb\n";

    expect(shownText(text, [{ start: 2, end: 4 }])).toBe("\uFEFFb");
  });

  it("drops a lone carriage return inside the line", () => {
    const text = "a\rb\n";

    expect(shownText(text, [{ start: 0, end: 3 }])).toBe("ab");
  });

  it("keeps a line of 200 characters whole", () => {
    const text = "x".repeat(200);

    expect(shownText(text, [{ start: 0, end: 200 }])).toBe(text);
  });

  it("cuts a longer line to 200 characters, the last of them an ellipsis", () => {
    const text = "x".repeat(201);

    expect(shownText(text, [{ start: 0, end: 201 }])).toBe(`${"x".repeat(199)}…`);
  });

  it("does not cut between the halves of a surrogate pair", () => {
    const text = `${"a".repeat(198)}😀${"b".repeat(10)}`;

    expect(shownText(text, [{ start: 0, end: text.length }])).toBe(`${"a".repeat(198)}…`);
  });

  it("joins runs that are apart with an ellipsis, and runs that touch without one", () => {
    const text = "f(a, x, b, y)";

    expect(
      shownText(text, [
        { start: 3, end: 6 },
        { start: 9, end: 12 },
      ]),
    ).toBe(", x … , y");
    expect(
      shownText(text, [
        { start: 3, end: 5 },
        { start: 5, end: 6 },
      ]),
    ).toBe(", x");
  });

  it("cuts joined runs to 200 characters as a whole", () => {
    const text = `${"x".repeat(150)}-${"y".repeat(150)}`;

    expect(
      shownText(text, [
        { start: 0, end: 150 },
        { start: 151, end: 301 },
      ]),
    ).toBe(`${"x".repeat(150)} … ${"y".repeat(46)}…`);
  });
});
