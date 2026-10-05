/**
 * Helpers the screens share: the comment toggle of the Playground's
 * variables editor, the theme cycle of the header, and the name an
 * imported API is given.
 */
import { describe, expect, it } from "vitest";
import type { ParsedSpec } from "@/features/apis/types";
import { toggleComment } from "@/features/playground/jsonc-helpers";
import { nextTheme } from "@/shell/theme-cycle";
import { deriveSourceName } from "../src/features/apis/derive-source-name";

describe("toggleComment", () => {
  it("comments every selected line, keeping each one's indent", () => {
    expect(toggleComment('{\n  "a": 1,\n  "b": 2\n}', 2, 20)).toEqual({
      text: '{\n  // "a": 1,\n  // "b": 2\n}',
      start: 5,
      end: 23,
    });
  });

  it("uncomments the selection when every line of it is commented", () => {
    expect(toggleComment("// a\n//b", 0, 7).text).toBe("a\nb");
  });
});

describe("nextTheme", () => {
  it("cycles dark, light, system", () => {
    expect([nextTheme("dark"), nextTheme("light"), nextTheme("system")]).toEqual([
      "light",
      "system",
      "dark",
    ]);
  });
});

describe("deriveSourceName", () => {
  const spec = (title: string, baseURL = ""): ParsedSpec => ({
    title,
    version: "1",
    description: "",
    baseURL,
    format: "openapi3",
    groups: [],
    schemas: {},
    securitySchemes: [],
    skipped: [],
  });

  it("names an API from its title", () => {
    expect(deriveSourceName(spec("Pet Store"))).toBe("petStore");
  });

  it("falls back to the most telling part of its host, past the TLD and generic sub-domains", () => {
    expect(deriveSourceName(spec("API", "https://api.stripe.com/v1"))).toBe("stripe");
  });
});
