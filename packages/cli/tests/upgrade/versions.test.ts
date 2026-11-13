import { describe, expect, it } from "vitest";

import { compareVersions, formatVersion, parseVersion } from "../../src/upgrade/versions";

const v = (text: string) => {
  const version = parseVersion(text);
  if (version === undefined) throw new Error(`no version: ${text}`);
  return version;
};

describe("versions", () => {
  it("reads a release, a v prefix, a pre-release tag and build metadata, and nothing else", () => {
    expect(parseVersion("0.5.0")).toEqual({ major: 0, minor: 5, patch: 0, pre: "" });
    expect(parseVersion("v1.2.3-beta.10+build.7")).toEqual({
      major: 1,
      minor: 2,
      patch: 3,
      pre: "beta.10",
    });
    expect(parseVersion("^0.5.0")).toBeUndefined();
    expect(parseVersion("0.5")).toBeUndefined();
  });

  it("orders versions as npm does: a pre-release before its release, its numbers by value", () => {
    const ordered = [
      "0.4.0",
      "0.4.10",
      "0.5.0-alpha",
      "0.5.0-alpha.2",
      "0.5.0-alpha.10",
      "0.5.0-beta",
      "0.5.0",
      "1.0.0",
    ];

    expect([...ordered].reverse().sort((a, b) => compareVersions(v(a), v(b)))).toEqual(ordered);
    expect(compareVersions(v("0.5.0"), v("0.5.0"))).toBe(0);
  });

  it("writes a version as npm does, its pre-release tag after a hyphen", () => {
    expect(formatVersion(v("0.5.3"))).toBe("0.5.3");
    expect(formatVersion(v("0.5.0-rc.1"))).toBe("0.5.0-rc.1");
  });
});
