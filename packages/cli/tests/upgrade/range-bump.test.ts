import { describe, expect, it } from "vitest";

import { bumpRange } from "../../src/upgrade/range-bump";
import { parseVersion } from "../../src/upgrade/versions";

const TARGET = parseVersion("0.5.0") ?? { major: 0, minor: 5, patch: 0, pre: "" };

describe("bumpRange", () => {
  it.each([
    ["0.4.0", "0.5.0"],
    ["=0.4.0", "0.5.0"],
    ["v0.4.0", "0.5.0"],
    ["^0.4.0", "^0.5.0"],
    ["^0.4.2-beta.1", "^0.5.0"],
    ["~0.4.1", "~0.5.0"],
    ["^0.4", "^0.5"],
    ["~0.4", "~0.5"],
    ["0.4.x", "0.5.x"],
    ["^0.4.*", "^0.5.*"],
    [" ^0.4.0 ", "^0.5.0"],
  ])("raises %j to %j, the same kind of range", (range, to) => {
    expect(bumpRange(range, TARGET)).toEqual({ to });
  });

  it.each([
    ["*", "it allows 0.5.0"],
    ["latest", "it allows 0.5.0"],
    ["0.x", "it allows 0.5.0"],
    [">=0.3.0", "a range the upgrade does not rewrite: write ^0.5.0 in its place"],
    [">=0.3 <0.5", "a range the upgrade does not rewrite: write ^0.5.0 in its place"],
    ["^0.3.0 || ^0.4.0", "a range the upgrade does not rewrite: write ^0.5.0 in its place"],
    ["workspace:*", "a package of the project's own"],
    ["file:../courier", "a package of the project's own"],
    ["npm:@noverax/courier@^0.4.0", "an alias: write npm:<package>@^0.5.0 in its place"],
    ["github:NoveraX/courier", "a git or URL source"],
    ["https://example.com/courier.tgz", "a git or URL source"],
  ])("leaves %j as written: %s", (range, why) => {
    expect(bumpRange(range, TARGET)).toEqual({ why });
  });

  it("raises a range it raised already to itself, whatever kind it is", () => {
    for (const range of ["0.4.0", "^0.4.0", "~0.4", "0.4.x", "^1", "1.2.3"]) {
      const first = bumpRange(range, TARGET);
      if (!("to" in first)) throw new Error(`left: ${range}`);
      expect(bumpRange(first.to, TARGET)).toEqual(first);
      expect(first.to.charAt(0)).toBe(/^[\^~]/.test(range) ? range.charAt(0) : first.to.charAt(0));
    }
  });
});
