import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import { packagesOf, workspaceOf } from "../../src/upgrade/workspace";
import { manifest, projectWith, removeProjects } from "../helpers/temp-project";

afterAll(removeProjects);

const PACKAGE = manifest({ name: "member" });

describe("workspaceOf", () => {
  it("finds the workspace from one of its packages, with every package its globs name", () => {
    const root = projectWith({
      "package.json": manifest({
        name: "shop",
        workspaces: ["apps/*", "packages/**", "!apps/legacy"],
      }),
      "apps/web/package.json": PACKAGE,
      "apps/api/package.json": PACKAGE,
      "apps/legacy/package.json": PACKAGE,
      "apps/notes/README.md": "no package here\n",
      "packages/ui/button/package.json": PACKAGE,
      "packages/node_modules/dep/package.json": PACKAGE,
    });

    expect(workspaceOf(join(root, "apps/web"))).toEqual({
      root,
      packages: ["", "apps/api", "apps/web", "packages/ui/button"],
    });
  });

  it("is the folder alone where no workspace above names it", () => {
    const root = projectWith({
      "package.json": manifest({ workspaces: ["apps/*"] }),
      "tools/script/package.json": PACKAGE,
    });

    expect(workspaceOf(join(root, "tools/script"))).toEqual({
      root: join(root, "tools/script"),
      packages: [""],
    });
  });

  it("takes a glob's folder named as it is, and none that is not there", () => {
    const root = projectWith({ "tools/cli/package.json": PACKAGE });

    expect(packagesOf(root, ["tools/cli", "./tools/cli", "missing/*"])).toEqual(["tools/cli"]);
  });
});
