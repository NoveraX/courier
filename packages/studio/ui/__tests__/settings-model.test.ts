/**
 * The Settings draft's reckoning: what it changed from the saved settings,
 * how it follows a setting saved elsewhere meanwhile, and why an ignore
 * pattern cannot be added — Studio tests each as a regular expression.
 */
import { describe, expect, it } from "vitest";

import { changedKeys, patternProblem, rebase } from "@/features/settings/settings-draft";
import { crumbsOf } from "@/shell/header/breadcrumbs";
import { DEFAULT_SETTINGS } from "@/store/constants";

describe("the draft", () => {
  it("names the settings it changed, lists included", () => {
    const draft = { ...DEFAULT_SETTINGS, jsonIndent: 4 as const, ignorePatterns: ["^/health"] };

    expect(changedKeys(draft, DEFAULT_SETTINGS)).toEqual(new Set(["jsonIndent", "ignorePatterns"]));
    expect(changedKeys(DEFAULT_SETTINGS, { ...DEFAULT_SETTINGS }).size).toBe(0);
  });

  it("follows a setting saved elsewhere that it did not change, and keeps the ones it did", () => {
    const base = DEFAULT_SETTINGS;
    const draft = { ...base, jsonIndent: 4 as const, theme: "dark" as const };
    const saved = { ...base, theme: "light" as const, slowRequestThreshold: 2000 };

    const moved = rebase(draft, base, saved);

    expect(moved).toMatchObject({ jsonIndent: 4, theme: "light", slowRequestThreshold: 2000 });
  });
});

describe("an ignore pattern", () => {
  it("must be typed, new, and a regular expression", () => {
    expect(patternProblem([], "  ")).toBe("Type a pattern first");
    expect(patternProblem(["^/health"], " ^/health ")).toBe("That pattern is already ignored");
    expect(patternProblem([], "*.png")).toBe("Not a regular expression: Nothing to repeat");
    expect(patternProblem([], "\\.png$")).toBeNull();
  });
});

describe("the header's trail", () => {
  it("puts Settings under System", () => {
    expect(crumbsOf("/settings")).toEqual(["System", "Settings"]);
    expect(crumbsOf("/")).toEqual(["Studio", "Welcome"]);
  });

  it("names an address that is no page as not found, not as the setup", () => {
    expect(crumbsOf("/no-such-page")).toEqual(["Studio", "Not found"]);
    expect(crumbsOf("/timeline")).toEqual(["Inspect", "Timeline"]);
  });
});
