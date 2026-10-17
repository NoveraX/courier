import { afterAll, describe, expect, it } from "vitest";

import { configObjectPath } from "../../src/project/config-file";
import { aliasedFiles } from "../../src/project/path-aliases";
import { readProject } from "../../src/project/read-project";
import { projectWith, removeProjects } from "../recipes/project-fixture";

afterAll(removeProjects);

function projectOf(files: Record<string, string>) {
  return readProject(projectWith({ "package.json": "{}", ...files }));
}

describe("aliasedFiles", () => {
  it("reads tsconfig paths against baseUrl, through what the tsconfig extends", () => {
    const project = projectOf({
      "tsconfig.base.json":
        '{ "compilerOptions": { "baseUrl": "src", "paths": { "@server/*": ["./server/*"], "@routes": ["./courier/routes.ts"] } } }',
      "tsconfig.json":
        '{ "extends": "./tsconfig.base.json", "compilerOptions": { "strict": true } }',
      "src/server/app.ts": "export {};\n",
    });

    expect(aliasedFiles(project, "@server/courier/routes")).toEqual(["src/server/courier/routes"]);
    expect(aliasedFiles(project, "@routes")).toEqual(["src/courier/routes"]);
    expect(aliasedFiles(project, "server/app")).toEqual(["src/server/app"]);
    expect(aliasedFiles(project, "server/missing")).toEqual([]);
  });

  it("reads paths against the tsconfig that names them where no baseUrl is set", () => {
    const project = projectOf({
      "config/tsconfig.json": '{ "compilerOptions": { "paths": { "~app/*": ["../app/*"] } } }',
      "tsconfig.json": '{ "extends": "./config/tsconfig.json" }',
    });

    expect(aliasedFiles(project, "~app/routes.js")).toEqual(["app/routes"]);
  });

  it("reads package.json imports, a path or the first its conditions give", () => {
    const project = readProject(
      projectWith({
        "package.json": JSON.stringify({
          imports: {
            "#courier/*": "./src/courier/*.ts",
            "#config": { types: "./src/config.d.ts", default: "./src/config.ts" },
            "#dep": "some-package",
          },
        }),
      }),
    );

    expect(aliasedFiles(project, "#courier/routes")).toEqual(["src/courier/routes"]);
    expect(aliasedFiles(project, "#config")).toEqual(["src/config"]);
    expect(aliasedFiles(project, "#dep")).toEqual([]);
  });

  it("names no file for a package, nor without a tsconfig or imports", () => {
    expect(aliasedFiles(projectOf({ "tsconfig.json": "{}" }), "express")).toEqual([]);
    expect(aliasedFiles(projectOf({}), "@server/x")).toEqual([]);
  });
});

describe("configObjectPath", () => {
  it("follows a pass-on written with one of the project's aliases, and not one it cannot resolve", () => {
    const files = {
      "courier.config.ts": 'export { default } from "@/src/courier/config";\n',
      "src/courier/config.ts": "export default defineConfig({ sources: { shop } });\n",
    };

    expect(
      configObjectPath(
        projectOf({
          ...files,
          "tsconfig.json": '{ "compilerOptions": { "paths": { "@/*": ["./*"] } } }',
        }),
      ),
    ).toBe("src/courier/config.ts");
    expect(configObjectPath(projectOf({ ...files, "tsconfig.json": "{}" }))).toBe(
      "courier.config.ts",
    );
  });
});
