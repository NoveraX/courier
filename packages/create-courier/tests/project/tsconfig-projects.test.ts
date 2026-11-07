import { afterAll, describe, expect, it } from "vitest";

import { tsconfigProjects } from "../../src/project/tsconfig-chain";
import { projectWith, removeProjects } from "../recipes/project-fixture";

afterAll(removeProjects);

describe("tsconfigProjects", () => {
  it("reads tsconfig.json, and each project its references name, a file or a folder's, through what each extends", () => {
    const root = projectWith({
      "package.json": "{}",
      "tsconfig.json":
        '{ "files": [], "references": [{ "path": "./tsconfig.app.json" }, { "path": "./tools" }, { "path": "./missing.json" }] }',
      "tsconfig.app.json":
        '{ "extends": "./tsconfig.base.json", "compilerOptions": { "verbatimModuleSyntax": true } }',
      "tsconfig.base.json": '{ "compilerOptions": { "strict": true } }',
      "tools/tsconfig.json": '{ "compilerOptions": { "module": "nodenext" } }',
    });

    expect(tsconfigProjects(root).map((levels) => levels.map(({ options }) => options))).toEqual([
      [{}],
      [{ verbatimModuleSyntax: true }, { strict: true }],
      [{ module: "nodenext" }],
    ]);
  });

  it("reads none without a tsconfig.json", () => {
    expect(tsconfigProjects(projectWith({ "package.json": "{}" }))).toEqual([]);
  });
});
