import { afterAll, describe, expect, it } from "vitest";

import { pnpmPackages, workspacePatterns } from "../../src/upgrade/workspace-patterns";
import { manifest, projectWith, removeProjects } from "../helpers/temp-project";

afterAll(removeProjects);

describe("pnpmPackages", () => {
  it("reads the block of globs under packages, quoted or bare, its comments left out", () => {
    const yaml =
      "packages:\n  - \"apps/*\"   # the apps\n  - 'packages/*'\n  - tools/cli\n\ncatalog:\n  zod: ^4\n";

    expect(pnpmPackages(yaml)).toEqual(["apps/*", "packages/*", "tools/cli"]);
  });

  it("reads a flow list on the key's own line, and nothing where the file lists no packages", () => {
    expect(pnpmPackages('packages: ["apps/*", packages/**]\n')).toEqual(["apps/*", "packages/**"]);
    expect(pnpmPackages("catalog:\n  zod: ^4\n")).toEqual([]);
  });
});

describe("workspacePatterns", () => {
  it("reads package.json's workspaces as a list, or as Yarn's packages, and pnpm's file first", () => {
    const listed = projectWith({ "package.json": manifest({ workspaces: ["apps/*"] }) });
    const yarn = projectWith({
      "package.json": manifest({ workspaces: { packages: ["packages/*"] } }),
    });
    const pnpm = projectWith({
      "package.json": manifest({ workspaces: ["ignored/*"] }),
      "pnpm-workspace.yaml": "packages:\n  - apps/*\n",
    });
    const none = projectWith({ "package.json": manifest({ name: "app" }) });

    expect(workspacePatterns(listed)).toEqual(["apps/*"]);
    expect(workspacePatterns(yarn)).toEqual(["packages/*"]);
    expect(workspacePatterns(pnpm)).toEqual(["apps/*"]);
    expect(workspacePatterns(none)).toBeUndefined();
  });
});
