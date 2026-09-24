/**
 * Merging class names with the type scale's own utilities: a `text-caption`
 * or `text-body-sm` sets the font size, so it replaces `text-xs` and leaves
 * the text colour it is combined with in place.
 */
import { describe, expect, it } from "vitest";

import { cn } from "../src/lib/utils";

describe("cn", () => {
  it("keeps a status colour next to a type-scale size", () => {
    const merged = cn("text-xs font-medium text-rose-400", "text-caption").split(" ");

    expect(merged).toContain("text-rose-400");
    expect(merged).toContain("text-caption");
    expect(merged).not.toContain("text-xs");
  });

  it("lets the later of two sizes win", () => {
    expect(cn("text-body-sm", "text-xs")).toBe("text-xs");
  });
});
