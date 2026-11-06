import { describe, expect, it } from "vitest";

import { additionsOf } from "../../src/upgrade/package-needs";
import type { CourierPackage } from "../../src/upgrade/project-packages";

const WORKSPACE = { root: "/work/shop", packages: ["", "apps/web"] };
const NEED = { name: "@noverax/courier-build", beside: "@noverax/courier-studio-core" };

function listed(manifest: string, name: string, field: CourierPackage["field"]): CourierPackage {
  return { manifest, name, field, range: "^0.4.0", installed: undefined };
}

describe("additionsOf", () => {
  it("adds a package to the manifest of the file's own package, in the field of the one it goes beside", () => {
    const packages = [
      listed("apps/web/package.json", "@noverax/courier-studio-core", "dependencies"),
    ];

    expect(
      additionsOf(WORKSPACE, packages, [{ path: "apps/web/src/load.ts", need: NEED }], "0.5.0"),
    ).toEqual(
      new Map([
        [
          "apps/web/package.json",
          new Map([["dependencies", { "@noverax/courier-build": "^0.5.0" }]]),
        ],
      ]),
    );
  });

  it("adds it as a dev dependency where its neighbour is listed nowhere, and not at all where it is listed", () => {
    const already = [listed("package.json", "@noverax/courier-build", "devDependencies")];

    expect(additionsOf(WORKSPACE, [], [{ path: "scripts/check.ts", need: NEED }], "0.5.0")).toEqual(
      new Map([
        ["package.json", new Map([["devDependencies", { "@noverax/courier-build": "^0.5.0" }]])],
      ]),
    );
    expect(
      additionsOf(WORKSPACE, already, [{ path: "scripts/check.ts", need: NEED }], "0.5.0"),
    ).toEqual(new Map());
  });
});
