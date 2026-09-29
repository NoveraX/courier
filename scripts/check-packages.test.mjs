/**
 * Self-test for `scripts/check-packages.mjs`: a tarball that lacks a file its
 * manifest points at, or carries one that must stay in the repository.
 */
import { describe, expect, it } from "vitest";

import { packageProblems } from "./check-packages.mjs";

const manifest = {
  name: "@noverax/example",
  exports: {
    ".": { types: "./lib/index.d.ts", import: "./lib/index.js" },
    "./server": { types: "./lib/server.d.ts", import: "./lib/server.js" },
    "./*": "./lib/*.js",
  },
  bin: { example: "./lib/cli.js" },
};
const complete = [
  "package.json",
  "README.md",
  "lib/index.d.ts",
  "lib/index.js",
  "lib/server.d.ts",
  "lib/server.js",
  "lib/cli.js",
];

describe("packageProblems", () => {
  it("passes a tarball carrying every file its manifest points at", () => {
    expect(packageProblems(manifest, complete)).toEqual([]);
  });

  it("names an entry's file, a declaration and a command the tarball lacks", () => {
    const files = complete.filter(
      (file) => !["lib/server.js", "lib/index.d.ts", "lib/cli.js"].includes(file),
    );

    expect(packageProblems(manifest, files)).toEqual([
      "@noverax/example: ./lib/index.d.ts, which its manifest points at, is not in the tarball",
      "@noverax/example: ./lib/server.js, which its manifest points at, is not in the tarball",
      "@noverax/example: ./lib/cli.js, which its manifest points at, is not in the tarball",
    ]);
  });

  it("names a source file or a test that would be published", () => {
    expect(packageProblems(manifest, [...complete, "src/index.ts", "lib/index.test.js"])).toEqual([
      "@noverax/example: src/index.ts must not be published",
      "@noverax/example: lib/index.test.js must not be published",
    ]);
  });

  it("requires the licence only for a release, once it has been copied beside the package", () => {
    expect(packageProblems(manifest, complete)).toEqual([]);
    expect(packageProblems(manifest, complete, { release: true })).toEqual([
      "@noverax/example: LICENSE is not in the tarball",
    ]);
  });

  it("requires the Studio's built UI, which no manifest field names", () => {
    expect(packageProblems({ name: "@noverax/courier-studio" }, ["README.md"])).toEqual([
      "@noverax/courier-studio: ui/dist/index.html is not in the tarball",
    ]);
  });
});
