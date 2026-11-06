import { afterAll, describe, expect, it } from "vitest";

import { courierPackages } from "../../src/upgrade/project-packages";
import { manifest, projectWith, removeProjects } from "../helpers/temp-project";

afterAll(removeProjects);

describe("courierPackages", () => {
  it("lists Courier's packages in every manifest and field, with the versions installed, hoisted among them", () => {
    const root = projectWith({
      "package.json": manifest({
        dependencies: { "@noverax/courier": "^0.4.0", zod: "^4.0.0" },
        devDependencies: { "@noverax/courier-studio": "~0.4.0" },
      }),
      "apps/web/package.json": manifest({
        peerDependencies: { "@noverax/courier-react": ">=0.4.0" },
      }),
      "node_modules/@noverax/courier/package.json": manifest({ version: "0.4.2" }),
      "node_modules/@noverax/courier-react/package.json": manifest({ version: "0.4.1" }),
    });

    expect(courierPackages({ root, packages: ["", "apps/web"] })).toEqual([
      {
        manifest: "package.json",
        name: "@noverax/courier",
        field: "dependencies",
        range: "^0.4.0",
        installed: "0.4.2",
      },
      {
        manifest: "package.json",
        name: "@noverax/courier-studio",
        field: "devDependencies",
        range: "~0.4.0",
        installed: undefined,
      },
      {
        manifest: "apps/web/package.json",
        name: "@noverax/courier-react",
        field: "peerDependencies",
        range: ">=0.4.0",
        installed: "0.4.1",
      },
    ]);
  });
});
