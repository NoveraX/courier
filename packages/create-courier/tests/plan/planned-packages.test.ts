import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { missingPackages, otherReleases } from "../../src/plan/planned-packages";
import { readProject } from "../../src/project/read-project";
import { projectWith, removeProjects } from "../recipes/project-fixture";

afterAll(removeProjects);

function projectListing(manifest: object) {
  return readProject(
    projectWith({
      "package.json": JSON.stringify({ name: "app", ...manifest }),
      "tsconfig.json": "{}",
    }),
  );
}

const PEERS = {
  dependencies: { "@noverax/courier": "^0.3.0" },
  devDependencies: { "@noverax/courier-studio": "^0.3.0" },
  peerDependencies: { zod: "^4.0.0" },
  optionalDependencies: { "@tanstack/react-query": "^5.0.0" },
};

const WANTED = [
  "@noverax/courier@^0.3.0",
  "@noverax/courier-studio@^0.3.0",
  "zod",
  "@tanstack/react-query",
  "@noverax/courier-next@^0.3.0",
];

describe("missingPackages", () => {
  it("counts a dependency or a dev one as there, and a peer or optional one only where it is installed", () => {
    const project = projectListing(PEERS);

    expect(missingPackages(project, WANTED)).toEqual([
      "zod",
      "@tanstack/react-query",
      "@noverax/courier-next@^0.3.0",
    ]);
  });

  it("finds a peer or optional one as Node does: here, or hoisted to a folder above", () => {
    const workspace = projectWith({
      "package.json": "{}",
      "node_modules/@tanstack/react-query/package.json": '{ "version": "5.90.0" }',
      "apps/web/package.json": JSON.stringify({ name: "web", ...PEERS }),
      "apps/web/node_modules/zod/package.json": '{ "version": "4.1.0" }',
    });

    expect(missingPackages(readProject(join(workspace, "apps/web")), WANTED)).toEqual([
      "@noverax/courier-next@^0.3.0",
    ]);
  });

  it("counts every one listed where Yarn's Plug'n'Play keeps the packages out of node_modules", () => {
    const project = readProject(
      projectWith({ "package.json": JSON.stringify({ name: "app", ...PEERS }), ".pnp.cjs": "" }),
    );

    expect(missingPackages(project, WANTED)).toEqual(["@noverax/courier-next@^0.3.0"]);
  });
});

describe("otherReleases", () => {
  it("names a package on another release line: another major, or under 1.0 another minor", () => {
    const project = projectListing({
      dependencies: { "@noverax/courier": "0.2.4", zod: "^3.25.0", hono: "^3.0.0" },
    });

    expect(otherReleases(project, ["@noverax/courier@^0.3.0", "hono@^4.0.0", "zod"])).toEqual([
      { name: "@noverax/courier", has: "0.2.4", wants: "^0.3.0" },
      { name: "hono", has: "^3.0.0", wants: "^4.0.0" },
    ]);
  });

  it("names nothing on the same line, missing, or written without a version", () => {
    const project = projectListing({
      dependencies: { "@noverax/courier": "^0.3.2", "@noverax/courier-next": "workspace:*" },
    });

    expect(
      otherReleases(project, [
        "@noverax/courier@^0.3.0",
        "@noverax/courier-next@^0.3.0",
        "@noverax/courier-react@^0.3.0",
      ]),
    ).toEqual([]);
  });
});
