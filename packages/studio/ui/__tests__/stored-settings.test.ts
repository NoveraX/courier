/**
 * @vitest-environment jsdom
 */
/**
 * The settings a page kept come back field by field. What the browser kept
 * may come from an older Studio or be edited by hand, and was spread over the
 * defaults unchecked: a removed theme or a count written as text reached the
 * store.
 */
import { afterEach, describe, expect, it } from "vitest";

import { DEFAULT_SETTINGS, loadSettings, SETTINGS_STORAGE_KEY } from "@/store/constants";

afterEach(() => localStorage.clear());

describe("the settings a page kept", () => {
  it("come back where each holds a value its field takes", () => {
    const kept = { theme: "light", maxRequests: 500, ignorePatterns: ["/health"], jsonIndent: 4 };
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(kept));

    expect(loadSettings()).toEqual({ ...DEFAULT_SETTINGS, ...kept });
  });

  it("give way to the default where a kept value is not one the field takes", () => {
    const kept = {
      theme: "purple",
      maxRequests: "lots",
      ignorePatterns: [1],
      jsonIndent: 3,
      preserveLog: "yes",
    };
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(kept));

    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it("bring back nothing that is not a setting", () => {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ legacyLayout: "wide" }));

    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });
});
