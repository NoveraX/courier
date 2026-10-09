import { afterAll, describe, expect, it } from "vitest";

import { importExtension } from "../../src/project/module-style";
import { projectWith, removeProjects } from "../recipes/project-fixture";

afterAll(removeProjects);

describe("importExtension", () => {
  it("asks for .js where TypeScript resolves modules as Node does", () => {
    expect(
      importExtension(
        projectWith({ "tsconfig.json": '{ "compilerOptions": { "module": "NodeNext" } }' }),
      ),
    ).toBe(".js");
  });

  it("asks for nothing where a bundler resolves them, or where there is no tsconfig", () => {
    expect(
      importExtension(
        projectWith({
          "tsconfig.json": '{ "compilerOptions": { "moduleResolution": "bundler" } }',
        }),
      ),
    ).toBe("");
    expect(importExtension(projectWith({ "package.json": "{}" }))).toBe("");
  });

  it("follows what the tsconfig extends, past its comments and trailing commas", () => {
    const root = projectWith({
      "tsconfig.json": '{\n  // the base\n  "extends": "./tsconfig.base.json",\n}\n',
      "tsconfig.base.json": '{ "compilerOptions": { "module": "node16", }, }',
    });

    expect(importExtension(root)).toBe(".js");
  });
});
