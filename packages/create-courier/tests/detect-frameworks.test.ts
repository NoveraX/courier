import { afterAll, describe, expect, it } from "vitest";

import { detectFramework } from "../src/frameworks";
import { readProject } from "../src/project/read-project";
import { manifest, projectWith, removeProjects } from "./recipes/project-fixture";

afterAll(removeProjects);

function listing(
  dependencies: Record<string, string>,
  devDependencies: Record<string, string> = {},
) {
  return readProject(
    projectWith({
      "package.json": manifest(dependencies, { devDependencies }),
      "tsconfig.json": "{}",
    }),
  );
}

describe("detectFramework", () => {
  it("tells no framework for a server the command does not set Courier up in, and the page's beside it", () => {
    expect(detectFramework(listing({ koa: "^3.0.0" }))).toBeUndefined();
    expect(
      detectFramework(listing({ koa: "^3.0.0", react: "19.2.0" }, { vite: "^7.1.0" }))?.id,
    ).toBe("react");
  });

  it("tells the server a page is served by before the page's own, for the recipe", () => {
    expect(
      detectFramework(listing({ express: "^5.1.0", react: "19.2.0", vite: "^7.1.0" }))?.id,
    ).toBe("express");
  });
});
