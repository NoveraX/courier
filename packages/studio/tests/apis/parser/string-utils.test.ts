/**
 * A description a specification writes in HTML, read as plain text: tags
 * dropped, the common entities read once, white space collapsed — in time
 * linear in its length, whatever a pasted specification holds.
 */
import { describe, expect, it } from "vitest";

import { stripHtml, stripHtmlPreserveNewlines } from "../../../src/apis/parser/string-utils";

describe("stripHtml", () => {
  it("drops the tags and reads the common entities", () => {
    expect(stripHtml("<p>Pets &amp; <b>owners</b> &lt;3 &quot;all&quot; &#39;day&#39;</p>")).toBe(
      "Pets & owners <3 \"all\" 'day'",
    );
  });

  it("reads each entity once, so an escaped entity stays one", () => {
    expect(stripHtml("&amp;lt;b&amp;gt; is written &amp;amp;lt;")).toBe(
      "&lt;b&gt; is written &amp;lt;",
    );
  });

  /* The text is read as text — in a comment, on Studio's page — and never as
     HTML again: a tag cut in two by another reads whole once that one is
     dropped, and stays as text, as an escaped tag read once does. */
  it("gives text, which may read like a tag, never HTML", () => {
    expect(stripHtml("<scr<x>ipt>")).toBe("<script>");
    expect(stripHtml("&lt;script&gt;")).toBe("<script>");
  });

  it("keeps an entity it does not know as written", () => {
    expect(stripHtml("caf&eacute; &copy;")).toBe("caf&eacute; &copy;");
  });

  it("collapses white space, line breaks included, and trims it", () => {
    expect(stripHtml("  one\n\ttwo   three  ")).toBe("one two three");
  });

  it("reads a long run of unclosed angle brackets at once", () => {
    const pasted = `${"<".repeat(500_000)}text`;

    expect(stripHtml(pasted)).toBe(pasted);
  });
});

describe("stripHtmlPreserveNewlines", () => {
  it("keeps the lines and collapses the rest of the white space", () => {
    expect(stripHtmlPreserveNewlines("A <i>pet</i>  store\nfor &quot;all&quot;")).toBe(
      'A pet store\nfor "all"',
    );
  });

  it("reads a long run of unclosed angle brackets at once", () => {
    const pasted = `${"<a".repeat(250_000)}\ntext`;

    expect(stripHtmlPreserveNewlines(pasted)).toBe(pasted);
  });
});
