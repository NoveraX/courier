/**
 * Self-test for `scripts/page-modules.mjs`: which file a sample says it is,
 * and which of its page's files an import of the reader's code points at.
 */
import { describe, expect, it } from "vitest";

import { appPath, placeSamples, sampleFile } from "./page-modules.mjs";

describe("sampleFile", () => {
  it("reads the file a fence's title names", () => {
    expect(sampleFile(' title="api/sources.ts"', "")).toBe("api/sources.ts");
  });

  it("reads the file a README sample names on its first line", () => {
    expect(sampleFile("", "// lib/query.ts — built once\nexport {}\n")).toBe("lib/query.ts");
  });

  it("takes a title that is not a file for none", () => {
    expect(sampleFile(' title="types"', "// no file here\n")).toBeUndefined();
  });
});

describe("appPath", () => {
  it.each([
    ["@/api/sources", undefined, "api/sources"],
    ["~/api/sources", undefined, "api/sources"],
    ["$lib/caller", undefined, "lib/caller"],
    ["../api/sources", "lib/query.ts", "api/sources"],
    ["./actions", "app/users/form.tsx", "app/users/actions"],
  ])("reads %j from %j as %j", (specifier, from, path) => {
    expect(appPath(specifier, from)).toBe(path);
  });

  it("takes a package for none", () => {
    expect(appPath("@noverax/courier", undefined)).toBeUndefined();
    expect(appPath("react", undefined)).toBeUndefined();
  });
});

describe("placeSamples", () => {
  const code = (samples) => [...placeSamples(samples, "/out").values()].map((sample) => sample.code);

  it("points an import at the last sample before it that shows the file", () => {
    const [, , third] = code([
      { page: "p", jsx: false, file: "lib/query.ts", code: "export const q = 1\n" },
      { page: "p", jsx: false, file: "lib/query.ts", code: "export const q = 2\n" },
      { page: "p", jsx: false, code: 'import { q } from "@/lib/query"\n' },
    ]);

    expect(third).toBe('import { q } from "./s1"\n');
  });

  it("does not reach into another page's files", () => {
    const [, second] = code([
      { page: "p", jsx: false, file: "api.ts", code: "export const api = 1\n" },
      { page: "q", jsx: false, code: 'import { api } from "@/api"\n' },
    ]);

    expect(second).toBe('import { api } from "@/api"\n');
  });
});
