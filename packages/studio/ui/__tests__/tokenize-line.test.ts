/**
 * A line of a snippet, split into the pieces the code view colours — a
 * command's flags among its keywords — and a line of JSON, its keys apart
 * from its strings.
 */
import { describe, expect, it } from "vitest";

import { tokenizeJsonLine } from "@/design/code/tokenize-json-line";
import { tokenizeLine } from "@/design/code/tokenize-line";

const tones = (line: string) =>
  tokenizeLine(line)
    .filter((t) => t.tone !== "space")
    .map((t) => [t.text, t.tone]);

describe("tokenizeLine", () => {
  it("tells keywords, strings, calls, types and the rest apart", () => {
    expect(tones('import { courierStudio } from "@noverax/courier-studio/react";')).toEqual([
      ["import", "keyword"],
      ["{", "punctuation"],
      ["courierStudio", "plain"],
      ["}", "punctuation"],
      ["from", "keyword"],
      ['"@noverax/courier-studio/react"', "string"],
      [";", "punctuation"],
    ]);
    expect(tones("plugins: [react(), Courier]")).toContainEqual(["react", "function"]);
    expect(tones("plugins: [react(), Courier]")).toContainEqual(["Courier", "type"]);
  });

  it("keeps every character of the line", () => {
    const line = '  attachRuntime("next-browser"); // `dev` only';

    expect(
      tokenizeLine(line)
        .map((t) => t.text)
        .join(""),
    ).toBe(line);
  });
});

describe("a shell command", () => {
  it("reads its command and its flags as keywords", () => {
    expect(tones("curl -X POST 'http://x' \\")).toEqual([
      ["curl", "keyword"],
      ["-", "punctuation"],
      ["X", "keyword"],
      ["POST", "type"],
      ["'http://x'", "string"],
      ["\\", "punctuation"],
    ]);
    expect(tones("for await (const event of caller.events()) {")).toContainEqual(["of", "keyword"]);
  });
});

describe("tokenizeJsonLine", () => {
  const json = (line: string) =>
    tokenizeJsonLine(line)
      .filter((t) => t.tone !== "space")
      .map((t) => [t.text, t.tone]);

  it("tells a key from a string, and colours numbers and literals", () => {
    expect(json('  "price": "64.00",')).toEqual([
      ['"price"', "function"],
      [":", "punctuation"],
      ['"64.00"', "string"],
      [",", "punctuation"],
    ]);
    expect(json('  "took": -4.5e2,')).toContainEqual(["-4.5e2", "number"]);
    expect(json("  null,")).toContainEqual(["null", "keyword"]);
  });

  it("keeps every character of the line", () => {
    const line = '  "a b": [true, {"c": 1}],';

    expect(
      tokenizeJsonLine(line)
        .map((t) => t.text)
        .join(""),
    ).toBe(line);
  });
});
