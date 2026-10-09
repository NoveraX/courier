import { afterAll, describe, expect, it } from "vitest";

import { buildPlan, changesAnything } from "../../src/plan/build-plan";
import type { Recipe } from "../../src/recipes/recipe-types";
import { contextOf, manifest, projectWith, removeProjects } from "../recipes/project-fixture";

afterAll(removeProjects);

const RECIPE: Recipe = {
  files: [
    { path: "courier.config.ts", content: "export default {};\n", purpose: "config" },
    { path: "src/api.ts", content: "export const api = 1;\n", purpose: "api" },
    { path: "src/kept.ts", content: "ours\n", purpose: "a file" },
  ],
  edits: [],
  dependencies: ["@noverax/courier", "zod"],
  devDependencies: ["@noverax/courier-studio"],
  scripts: { studio: "courier-studio" },
  manual: [],
  next: [],
};

describe("buildPlan", () => {
  it("creates what is missing, skips what is there already and keeps a file of the project's", () => {
    const root = projectWith({
      "package.json": manifest({ zod: "^4.0.0", typescript: "^6.0.0" }),
      "tsconfig.json": "{}",
      "courier.config.ts": "export default {};\n",
      "src/kept.ts": "theirs\n",
    });
    const plan = buildPlan(contextOf(root, "zod"), RECIPE);

    expect(plan.files.map((file) => `${file.path}:${file.state}`)).toEqual([
      "courier.config.ts:same",
      "src/api.ts:create",
      "src/kept.ts:kept",
    ]);
    expect(plan.manual[0]?.file).toBe("src/kept.ts");
    expect(plan.dependencies).toEqual(["@noverax/courier"]);
    expect(plan.typescript).toBeUndefined();
    expect(plan.edits.map((edit) => edit.path)).toEqual(["package.json"]);
  });

  it("adds TypeScript to a project without it", () => {
    const root = projectWith({
      "package.json": manifest({ nuxt: "^4.6.0" }),
      "tsconfig.json": "{}",
    });

    expect(buildPlan(contextOf(root, "nuxt"), RECIPE).typescript).toEqual({ to: "typescript@^6" });
  });

  it("leaves an existing project's older TypeScript to the person, and moves a new project's", () => {
    const root = projectWith({
      "package.json": manifest({ typescript: "^5.9.3" }),
      "tsconfig.json": "{}",
    });
    const existing = buildPlan(contextOf(root, "typescript"), RECIPE);
    const fresh = buildPlan({ ...contextOf(root, "typescript"), fresh: true }, RECIPE);

    expect(existing.typescript).toBeUndefined();
    expect(existing.manual.at(-1)?.lines).toEqual(["npm install --save-dev typescript@^6"]);
    expect(fresh.typescript).toEqual({ from: "^5.9.3", to: "typescript@^6" });
  });

  it("changes nothing in a project set up already", () => {
    const root = projectWith({
      "package.json": manifest(
        {
          "@noverax/courier": "^1.0.0",
          zod: "^4.0.0",
          "@noverax/courier-studio": "^1.0.0",
          typescript: "^6.0.0",
        },
        { scripts: { studio: "courier-studio" } },
      ),
      "tsconfig.json": "{}",
      "courier.config.ts": "export default {};\n",
      "src/api.ts": "export const api = 1;\n",
      "src/kept.ts": "ours\n",
    });

    expect(changesAnything(buildPlan(contextOf(root, "zod"), RECIPE))).toBe(false);
  });
});
