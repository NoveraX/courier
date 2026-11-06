import { describe, expect, it } from "vitest";

import { docsNote } from "../../src/upgrade/docs-note";
import { parseVersion } from "../../src/upgrade/versions";

const v = (text: string) => {
  const version = parseVersion(text);
  if (version === undefined) throw new Error(`no version: ${text}`);
  return version;
};

describe("the plan's note on the docs for the editor's agent", () => {
  it("names courier-cli setup --agents-md for a release that ships the docs, and nothing for an older one", () => {
    expect(docsNote([], v("0.5.0"))).toEqual([
      expect.stringContaining("npx @noverax/courier-cli setup --agents-md"),
    ]);
    expect(docsNote([], v("0.4.9"))).toEqual([]);
  });
});
