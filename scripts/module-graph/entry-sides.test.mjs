/**
 * Every entry a package exports is put on one side — a page's, a
 * server's, or both — so a new entry cannot pass the check of a page's
 * modules unclassified, and no side names an entry the package lacks.
 */
import { describe, expect, it } from "vitest";

import { entrySideBreaches } from "./entry-sides.mjs";

const EXPORTS = {
  "./package.json": "./package.json",
  ".": "./lib/index.js",
  "./client": "./lib/client/index.js",
  "./server": "./lib/server/index.js",
};

describe("entrySideBreaches", () => {
  it("passes a package each of whose entries is on one side, its manifest left out", () => {
    const sides = {
      pageEntries: { "./client": "a page's calls" },
      serverEntries: { "./server": "a server's side" },
      sharedEntries: { ".": "both" },
    };

    expect(entrySideBreaches("@noverax/courier", EXPORTS, sides)).toEqual([]);
  });

  it("breaches with an entry on no side, as a new one would be", () => {
    const sides = { pageEntries: { "./client": "a page's calls" }, sharedEntries: { ".": "both" } };

    expect(entrySideBreaches("@noverax/courier", EXPORTS, sides)).toEqual([
      "@noverax/courier exports ./server, which its module-sides.json puts on no side: pageEntries, serverEntries, sharedEntries",
    ]);
  });

  it("breaches with an entry on two sides, and a side naming an entry the package lacks", () => {
    const sides = {
      pageEntries: { "./client": "a page's calls", "./gone": "nothing" },
      serverEntries: { "./server": "a server's side", "./client": "again" },
      sharedEntries: { ".": "both" },
    };

    expect(entrySideBreaches("@noverax/courier", EXPORTS, sides)).toEqual([
      "@noverax/courier's module-sides.json puts ./client on more than one side: pageEntries, serverEntries",
      "@noverax/courier's module-sides.json names ./gone in pageEntries, which the package does not export",
    ]);
  });

  it("reads exports that name the root's target alone as the root", () => {
    expect(
      entrySideBreaches("@noverax/courier-react", "./lib/index.js", {
        pageEntries: { ".": "hooks" },
      }),
    ).toEqual([]);
  });
});
