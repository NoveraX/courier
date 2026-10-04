/**
 * Telling an API `defineApi` made from a plain object a registry might hold
 * as a source — what lets Studio's runtime open a source's streams as its
 * own clients do.
 */
import { describe, expect, it } from "vitest";

import { isDefinedApi } from "../src/define/api";
import { defineApi } from "../src/define/index";

describe("isDefinedApi", () => {
  it("is true for an API defineApi made", () => {
    expect(isDefinedApi(defineApi({ baseURL: "https://api.example.com", groups: {} }))).toBe(true);
  });

  it("is false for a plain source, or for no source at all", () => {
    expect(isDefinedApi({ options: { groups: {} } })).toBe(false);
    expect(isDefinedApi(undefined)).toBe(false);
    expect(isDefinedApi("api")).toBe(false);
  });
});
