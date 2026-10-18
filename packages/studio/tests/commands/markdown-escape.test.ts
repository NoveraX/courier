/**
 * What a report quotes, placed in GitHub's Markdown so it shows as written:
 * running text with every formatting character escaped and nothing GitHub
 * would link or typeset, and code spans with only what would end them or
 * split a table's cell.
 */
import { describe, expect, it } from "vitest";

import { markdownCode, markdownText } from "../../src/commands/markdown-escape";
import * as pageCopy from "../../ui/src/lib/markdown-escape";

const ZWSP = "\u200B";

describe("markdownText", () => {
  it("escapes what Markdown reads as formatting, a pipe among them", () => {
    expect(markdownText("was string | number, now Array<string>")).toBe(
      "was string \\| number, now Array\\<string\\>",
    );
    expect(markdownText("*bold* _em_ ~gone~ `code` [a](b) [c][d] &amp; &#39;")).toBe(
      `\\*bold\\* \\_em\\_ \\~gone\\~ \\\`code\\\` [a\\](b) [c\\][d] \\&amp; \\&#${ZWSP}39;`,
    );
  });

  it("escapes a backslash first, so one before a pipe is still shown", () => {
    expect(markdownText("a\\|b")).toBe("a\\\\\\|b");
  });

  it("writes its line breaks as spaces", () => {
    expect(markdownText("one\r\ntwo\nthree")).toBe("one two three");
  });

  it("leaves plain words and punctuation a line never reads as formatting", () => {
    expect(markdownText("users.list may now be missing: 3 calls, 2 fail.")).toBe(
      "users.list may now be missing: 3 calls, 2 fail.",
    );
  });

  it("leaves an underscore inside a word, a lone bracket and a lone ampersand as they are", () => {
    expect(markdownText("body.items[].user_id & [courier] p_1")).toBe(
      "body.items[].user_id & [courier] p_1",
    );
  });

  /**
   * GitHub links a mention and a reference to an issue, and typesets math,
   * in the text a backslash leaves, so an escape does not stop them: a name
   * in a definition would notify someone, or list the pull request on an
   * issue. A zero-width space after the sign, and before a dollar sign,
   * shows as nothing and leaves nothing to link.
   */
  it("keeps a mention, a reference to an issue and math from being read as such", () => {
    expect(markdownText("ask @octocat or @acme/core")).toBe(
      `ask @${ZWSP}octocat or @${ZWSP}acme/core`,
    );
    expect(markdownText("see #12, acme/shop#3, acme#4, GH-5 and gh-6")).toBe(
      `see #${ZWSP}12, acme/shop#${ZWSP}3, acme#${ZWSP}4, GH-${ZWSP}5 and gh-${ZWSP}6`,
    );
    expect(markdownText("$x^2$ costs $$5$$")).toBe(
      `${ZWSP}\\$x^2${ZWSP}\\$ costs ${ZWSP}\\$${ZWSP}\\$5${ZWSP}\\$${ZWSP}\\$`,
    );
  });

  it("keeps them so after a backslash of the text's own", () => {
    expect(markdownText("\\@octocat \\#7 \\$x$")).toBe(
      `\\\\@${ZWSP}octocat \\\\#${ZWSP}7 \\\\${ZWSP}\\$x${ZWSP}\\$`,
    );
  });

  it("leaves an address, a word that ends in GH and a pointer as they are", () => {
    expect(markdownText("api@example.com xGH-2 #/components/schemas/User")).toBe(
      "api@example.com xGH-2 #/components/schemas/User",
    );
  });
});

describe("markdownCode", () => {
  it("escapes a pipe for a table cell, and writes a backtick as a quote", () => {
    expect(markdownCode("search | filter `x`")).toBe("search \\| filter 'x'");
  });

  it("leaves a pipe alone outside a table, where a code span shows it as it is", () => {
    expect(markdownCode("search | filter", { table: false })).toBe("search | filter");
  });

  it("leaves a backslash as it is: a code span shows it so", () => {
    expect(markdownCode("C:\\path\\file")).toBe("C:\\path\\file");
  });

  /**
   * A backslash of the text's own before a pipe met the pipe's escape as two
   * backslashes: GitHub reads the pipe as escaped, but micromark and marked
   * read an escaped backslash and end the cell at the pipe, so the rest of
   * the text — HTML included — left the code span.
   */
  it("parts a backslash from the pipe after it in a table cell", () => {
    expect(markdownCode("a\\|b")).toBe(`a\\${ZWSP}\\|b`);
    expect(markdownCode("x\\|<img src=x onerror=alert(1)>")).toBe(
      `x\\${ZWSP}\\|<img src=x onerror=alert(1)>`,
    );
    expect(markdownCode("a\\\\|b")).toBe(`a\\\\${ZWSP}\\|b`);
    expect(markdownCode("\\||")).toBe(`\\${ZWSP}\\|\\|`);
  });

  it("leaves a backslash before a pipe alone outside a table", () => {
    expect(markdownCode("a\\|b", { table: false })).toBe("a\\|b");
  });

  it("writes its line breaks as spaces", () => {
    expect(markdownCode("a\nb")).toBe("a b");
  });
});

/* The page's audit export writes its report with a copy of these, which has
   to read every text as this one does. */
describe("the page's copy", () => {
  const TEXTS = [
    "",
    "|",
    "\\|",
    "\\\\|",
    "\\||",
    "a`b|c",
    "x\\|<img src=x onerror=alert(1)>",
    "@octocat, see #12 and acme/shop#3, GH-4",
    "$x costs $5 (or $6)",
    "first\nsecond\r\nthird",
    "_a_ user_id _b",
    "[x](y) [z][w] &amp; &#39;",
    "~~struck~~ *em* <b>",
  ];

  it.each(TEXTS)("writes %j as this one does", (text) => {
    expect(pageCopy.markdownText(text)).toBe(markdownText(text));
    expect(pageCopy.markdownCode(text)).toBe(markdownCode(text));
  });
});
