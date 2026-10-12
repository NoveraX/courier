/**
 * Slashes trimmed from the ends of an address or a path, in time linear in
 * its length however long a run of slashes it holds.
 */
import { describe, expect, it } from "vitest";

import { withoutEdgeSlashes, withoutTrailingSlashes } from "../src/utils/trim-slashes";

/* Long enough that a pattern tried again at every slash of the run would outlast the test. */
const LONG_RUN = "/".repeat(500_000);

describe("withoutTrailingSlashes", () => {
  it("drops every slash an address ends with, and only those", () => {
    expect(withoutTrailingSlashes("https://api.example.com/v1//")).toBe(
      "https://api.example.com/v1",
    );
    expect(withoutTrailingSlashes("https://api.example.com/v1")).toBe("https://api.example.com/v1");
    expect(withoutTrailingSlashes("//a//b")).toBe("//a//b");
  });

  it("leaves nothing of a text that is slashes alone, or empty", () => {
    expect(withoutTrailingSlashes("///")).toBe("");
    expect(withoutTrailingSlashes("")).toBe("");
  });

  it("passes over a long run of slashes inside the text at once", () => {
    const text = `https://api.example.com${LONG_RUN}v1`;

    expect(withoutTrailingSlashes(text)).toBe(text);
    expect(withoutTrailingSlashes(`${text}${LONG_RUN}`)).toBe(text);
  });
});

describe("withoutEdgeSlashes", () => {
  it("drops the slashes a path starts and ends with", () => {
    expect(withoutEdgeSlashes("/orders/")).toBe("orders");
    expect(withoutEdgeSlashes("//orders/:id//")).toBe("orders/:id");
    expect(withoutEdgeSlashes("orders")).toBe("orders");
  });

  it("leaves nothing of a path that is slashes alone, or empty", () => {
    expect(withoutEdgeSlashes("/")).toBe("");
    expect(withoutEdgeSlashes("")).toBe("");
  });

  it("passes over long runs of slashes at both ends and inside at once", () => {
    expect(withoutEdgeSlashes(`${LONG_RUN}a${LONG_RUN}b${LONG_RUN}`)).toBe(`a${LONG_RUN}b`);
  });
});
