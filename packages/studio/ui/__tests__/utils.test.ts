/**
 * Merging class names: a size from Studio's type scale survives a colour
 * given after it, for every size the tokens define.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { cn } from "@/lib/utils";

const TOKENS = readFileSync(new URL("../src/design/tokens.css", import.meta.url), "utf8");
const SIZES = [...TOKENS.matchAll(/--text-([a-z-]+):/g)].map(([, name]) => name);

describe("cn", () => {
  it("knows every size of the type scale from a text colour", () => {
    expect(SIZES.length).toBeGreaterThan(10);
    for (const size of SIZES) expect(cn(`text-${size}`, "text-err")).toBe(`text-${size} text-err`);
  });

  it("lets a later size replace an earlier one", () => {
    expect(cn("text-small", "text-kpi")).toBe("text-kpi");
  });
});
