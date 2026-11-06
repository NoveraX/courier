import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { RELEASES, releasesBetween } from "../../src/upgrade/releases";
import { parseVersion } from "../../src/upgrade/versions";

const v = (text: string) => {
  const version = parseVersion(text);
  if (version === undefined) throw new Error(`no version: ${text}`);
  return version;
};

/* The ids the docs site gives a page's headings, as rehype-slug writes them: lower case, spaces to hyphens, the rest of its punctuation dropped. */
function headingIds(page: string): Set<string> {
  return new Set(
    [...page.matchAll(/^#{2,4} (.+)$/gm)].map((heading) =>
      (heading[1] ?? "")
        .toLowerCase()
        .replace(/[^\p{L}\p{N} _-]/gu, "")
        .replace(/ /g, "-"),
    ),
  );
}

describe("Courier's releases", () => {
  it("are crossed after the line the project is on, up to the target's own", () => {
    const versions = (from: string, to: string) =>
      releasesBetween(v(from), v(to)).map((release) => release.version);

    expect(versions("0.3.1", "0.5.0")).toEqual(["0.4.0", "0.5.0"]);
    expect(versions("0.4.2", "0.5.3")).toEqual(["0.5.0"]);
    expect(versions("0.5.0", "0.5.1")).toEqual([]);
    expect(versions("0.4.0", "0.4.9")).toEqual([]);
  });

  it("are in order, and send each breaking change to a heading the upgrading page has", () => {
    const page = readFileSync(
      new URL("../../../../docs/src/content/docs/upgrading.mdx", import.meta.url),
      "utf8",
    );
    const ids = headingIds(page);
    const anchors = RELEASES.flatMap((release) => release.notes)
      .map((note) => /\/docs\/upgrading#(.+)$/.exec(note.docs)?.[1])
      .filter((anchor): anchor is string => anchor !== undefined);

    expect(RELEASES.map((release) => release.version)).toEqual(["0.4.0", "0.5.0"]);
    expect(anchors.length).toBeGreaterThan(0);
    expect(anchors.filter((anchor) => !ids.has(anchor))).toEqual([]);
  });
});
