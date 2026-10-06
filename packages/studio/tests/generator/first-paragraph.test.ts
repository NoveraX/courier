/**
 * The summary above a generated caller is the description's first
 * paragraph as Markdown renders it, cut at a sentence or a word.
 */
import { describe, expect, it } from "vitest";
import { firstParagraph } from "../../src/apis/generator/first-paragraph";

/* Petstore's own description: its first paragraph is wrapped by hand. */
const PETSTORE = [
  "This is a sample Pet Store Server based on the OpenAPI 3.0 specification.  You can find out more about",
  "Swagger at [https://swagger.io](https://swagger.io). In the third iteration of the pet store, we've switched to the design first approach!",
  "You can now help us improve the API whether it's by making changes to the definition itself or to the code.",
  "That way, with time, we can improve the API in general, and expose some of the new features in OAS3.",
  "",
  "Some useful links:",
  "- [The Pet Store repository](https://github.com/swagger-api/swagger-petstore)",
].join("\n");

describe("the summary of a description", () => {
  it("joins a paragraph wrapped by hand, and ends at the last sentence that fits", () => {
    expect(firstParagraph(PETSTORE)).toBe(
      "This is a sample Pet Store Server based on the OpenAPI 3.0 specification. You can find out more about Swagger at [https://swagger.io](https://swagger.io).",
    );
  });

  it("keeps a paragraph that fits whole, and nothing after the blank line", () => {
    expect(firstParagraph("Sells pets.\nShips them too.\n\nMore below.")).toBe(
      "Sells pets. Ships them too.",
    );
  });

  it("skips headings, alone or on a paragraph's first line", () => {
    expect(firstParagraph("# Shop\n\nSells pets.")).toBe("Sells pets.");
    expect(firstParagraph("## Shop\nSells pets.")).toBe("Sells pets.");
  });

  it("ends a sentence too long to fit at its last word, with an ellipsis", () => {
    const long = `${"word ".repeat(60)}end`;

    const summary = firstParagraph(long);

    expect(summary.endsWith("word…")).toBe(true);
    expect(summary.length).toBeLessThanOrEqual(201);
  });

  it("says nothing for a description with no paragraph", () => {
    expect(firstParagraph("")).toBe("");
    expect(firstParagraph("# Only a heading")).toBe("");
  });
});
