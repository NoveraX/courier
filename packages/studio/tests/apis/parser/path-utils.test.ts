/**
 * The prefix a group of paths takes, found as the reading it replaced found
 * it, and for any number of paths: that one spread every path's length into
 * one call, which a specification of some 125 000 paths overflowed.
 */
import { describe, expect, it } from "vitest";

import { findCommonPrefix } from "../../../src/apis/parser/path-utils";
import { seededRandom } from "../../helpers/seeded-random";

/* The reading this one replaced, as it stood. */
function spreadCommonPrefix(paths: string[]): string {
  if (paths.length === 0) return "/";
  if (paths.length === 1) {
    const first = paths[0] ?? "";
    const parts = first.split("/").filter(Boolean);
    if (parts.length <= 1) return "/";
    return `/${parts.slice(0, -1).join("/")}`;
  }

  const segments = paths.map((p) => p.split("/").filter(Boolean));
  const minLen = Math.min(...segments.map((s) => s.length));
  const common: string[] = [];
  const firstSegments = segments[0] ?? [];

  for (let i = 0; i < minLen; i++) {
    const segment = firstSegments[i];
    if (!segment || segment.startsWith("{") || segment.startsWith(":")) break;
    if (segments.every((s) => s[i] === segment)) {
      common.push(segment);
    } else break;
  }

  return common.length > 0 ? `/${common.join("/")}` : "/";
}

describe("findCommonPrefix", () => {
  it("finds what the reading it replaced found, on 5 000 random sets of paths", () => {
    const segments = ["a", "b", "{id}", ":id", "c"];
    for (let seed = 1; seed <= 5_000; seed += 1) {
      const next = seededRandom(seed);
      const paths = Array.from(
        { length: next(6) },
        () => `/${Array.from({ length: next(4) }, () => segments[next(5)]).join("/")}`,
      );

      expect(findCommonPrefix(paths)).toBe(spreadCommonPrefix(paths));
    }
  });

  it("finds the prefix of 300 000 paths", () => {
    const paths = Array.from({ length: 300_000 }, (_, at) => `/v1/items/${at}`);

    expect(findCommonPrefix(paths)).toBe("/v1/items");
  });
});
