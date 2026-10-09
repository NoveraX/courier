import { realpathSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import { resolveBin } from "../../src/apply/resolve-in-project";
import { projectWith, removeProjects } from "../recipes/project-fixture";

afterAll(removeProjects);

describe("resolveBin", () => {
  it("finds a program through the manifest of a package whose exports hide its files, as TypeScript 7's do", () => {
    const root = projectWith({
      "package.json": "{}",
      "node_modules/typescript/package.json": JSON.stringify({
        name: "typescript",
        exports: { "./package.json": "./package.json", ".": "./lib/version.cjs" },
        bin: { tsc: "./bin/tsc" },
      }),
      "node_modules/typescript/bin/tsc": "",
    });

    expect(resolveBin(root, "typescript", "tsc")).toBe(
      join(realpathSync(root), "node_modules/typescript/bin/tsc"),
    );
  });

  it("reads a bin given as one path, and finds nothing for a package the project does not have", () => {
    const root = projectWith({
      "package.json": "{}",
      "node_modules/vue-tsc/package.json": JSON.stringify({
        name: "vue-tsc",
        bin: "./bin/vue-tsc.js",
      }),
    });

    expect(resolveBin(root, "vue-tsc", "vue-tsc")).toBe(
      join(realpathSync(root), "node_modules/vue-tsc/bin/vue-tsc.js"),
    );
    expect(resolveBin(root, "typescript", "tsc")).toBeUndefined();
  });
});
