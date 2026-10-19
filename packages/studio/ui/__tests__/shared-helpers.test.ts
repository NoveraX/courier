/**
 * Helpers the screens share: the comment toggle of the Playground's
 * variables editor, the theme cycle of the header, and the name an
 * imported API is given — within the length Studio's server writes an
 * import under, which the name is checked against.
 */
import { describe, expect, it } from "vitest";
import type { ParsedSpec } from "@/features/apis/types";
import { toggleComment } from "@/features/playground/jsonc-helpers";
import { nextTheme } from "@/shell/theme-cycle";
import { MAX_NAME_LENGTH } from "../../src/apis/max-name-length";
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

  it("names an import after a long title within the 128 characters Studio takes, in whole words", () => {
    const title = Array.from({ length: 40 }, (_, at) => `Word${at}`).join(" ");
    const joined = title.replace(/ /g, "");
    const name = deriveSourceName(spec(title));

    expect(name.length).toBeLessThanOrEqual(MAX_NAME_LENGTH);
    expect(name.length).toBeGreaterThan(MAX_NAME_LENGTH - "Word39".length);
    expect(name).toBe(`w${joined.slice(1, name.length)}`);
    expect(joined[name.length]).toBe("W");
  });

  it("cuts a title of one long word to 128 characters", () => {
    expect(deriveSourceName(spec("a".repeat(300)))).toBe("a".repeat(MAX_NAME_LENGTH));
  });
});
