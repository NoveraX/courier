/**
 * A line of a snippet, split into the pieces the code view colours.
 */
import { describe, expect, it } from "vitest";

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
