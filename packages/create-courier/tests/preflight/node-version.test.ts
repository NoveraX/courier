import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { NODE_FLOOR, nodeTooOld } from "../../src/preflight/node-version";

/* The floor a package's engines field names, as major and minor: ">=22.13" is 22.13. */
function floorOf(manifest: string): { major: number; minor: number } {
  const parsed: unknown = JSON.parse(readFileSync(new URL(manifest, import.meta.url), "utf8"));
  const range =
    typeof parsed === "object" && parsed !== null && "engines" in parsed
      ? JSON.stringify(parsed.engines)
      : "";
  const [, major = "0", minor = "0"] = /(\d+)(?:\.(\d+))?/.exec(range) ?? [];
  return { major: Number(major), minor: Number(minor) };
}

describe("nodeTooOld", () => {
  it.each(["22.12.0", "21.9.0", "20.18.1"])(
    "refuses Node %s, naming the one it needs",
    (version) => {
      expect(nodeTooOld(version)).toBe(
        `create-courier needs Node.js 22.13 or later, which Studio and its mock need: this is ${version}`,
      );
    },
  );

  it.each(["22.13.0", "22.22.2", "24.0.0", "26.13.0"])("takes Node %s", (version) => {
    expect(nodeTooOld(version)).toBeUndefined();
  });

  it("asks for the Node the packages it installs ask for, and create-courier's own engines say so", () => {
    const floors = ["../../../studio/package.json", "../../../mock/package.json"].map(floorOf);
    const highest = floors.reduce((a, b) =>
      b.major > a.major || (b.major === a.major && b.minor > a.minor) ? b : a,
    );

    expect(NODE_FLOOR).toEqual(highest);
    expect(floorOf("../../package.json")).toEqual(highest);
  });
});
