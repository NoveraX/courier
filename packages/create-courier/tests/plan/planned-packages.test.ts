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

describe("missingPackages", () => {
  it("counts a package listed as a dependency of any kind as there", () => {
    const project = projectListing({
      dependencies: { "@noverax/courier": "^0.3.0" },
      devDependencies: { "@noverax/courier-studio": "^0.3.0" },
      peerDependencies: { zod: "^4.0.0" },
      optionalDependencies: { "@tanstack/react-query": "^5.0.0" },
    });

    expect(
      missingPackages(project, [
        "@noverax/courier@^0.3.0",
        "@noverax/courier-studio@^0.3.0",
        "zod",
        "@tanstack/react-query",
        "@noverax/courier-next@^0.3.0",
      ]),
    ).toEqual(["@noverax/courier-next@^0.3.0"]);
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
