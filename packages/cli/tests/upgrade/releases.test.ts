import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { RELEASES, releasesBetween } from "../../src/upgrade/releases";
import { parseVersion } from "../../src/upgrade/versions";

const v = (text: string) => {
  const version = parseVersion(text);
  if (version === undefined) throw new Error(`no version: ${text}`);
  return version;
};

/* The id the docs site gives a heading, as rehype-slug writes it: lower case, spaces to hyphens, the rest of its punctuation dropped. */
function idOf(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/[^\p{L}\p{N} _-]/gu, "")
    .replace(/ /g, "-");
}

function headingIds(page: string): Set<string> {
  return new Set([...page.matchAll(/^#{2,4} (.+)$/gm)].map((heading) => idOf(heading[1] ?? "")));
}

/* The ids of the sections whose rows pair what 0.4 did with what holds now: a release's breaking changes. */
function changeSections(page: string): string[] {
  return page
    .split(/^(?=#{2,4} )/m)
    .filter((section) => /^\| 0\.4 \| Now \|$/m.test(section))
    .map((section) => idOf(/^#{2,4} (.+)$/m.exec(section)?.[1] ?? ""));
}

const PAGE = readFileSync(
  new URL("../../../../docs/src/content/docs/upgrading.mdx", import.meta.url),
  "utf8",
);
const ANCHORS = RELEASES.flatMap((release) => release.notes)
  .map((note) => /\/docs\/upgrading#(.+)$/.exec(note.docs)?.[1])
  .filter((anchor): anchor is string => anchor !== undefined);

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
    const ids = headingIds(PAGE);

    expect(RELEASES.map((release) => release.version)).toEqual(["0.4.0", "0.5.0"]);
    expect(ANCHORS.length).toBeGreaterThan(0);
    expect(ANCHORS.filter((anchor) => !ids.has(anchor))).toEqual([]);
  });

  it("name every section of the upgrading page that pairs 0.4 with what holds now", () => {
    const sections = changeSections(PAGE);

    expect(sections).toContain("endpoints-addressed-with-via");
    expect(sections.filter((section) => !ANCHORS.includes(section))).toEqual([]);
  });
});
