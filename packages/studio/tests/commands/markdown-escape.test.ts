/**
 * What a report quotes, placed in GitHub's Markdown so it shows as written:
 * running text with every formatting character escaped, and code spans with
 * only what would end them or split a table's cell.
 */
import { describe, expect, it } from "vitest";

import { markdownCode, markdownText } from "../../src/commands/markdown-escape";

describe("markdownText", () => {
  it("escapes what Markdown reads as formatting, a pipe among them", () => {
    expect(markdownText("was string | number, now Array<string>")).toBe(
      "was string \\| number, now Array\\<string\\>",
    );
    expect(markdownText("*bold* _em_ ~gone~ `code` [a](b) [c][d] &amp; &#39;")).toBe(
      "\\*bold\\* \\_em\\_ \\~gone\\~ \\`code\\` [a\\](b) [c\\][d] \\&amp; \\&#39;",
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

  it("writes its line breaks as spaces", () => {
    expect(markdownCode("a\nb")).toBe("a b");
  });
});
