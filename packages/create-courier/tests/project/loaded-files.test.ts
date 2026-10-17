import { afterAll, describe, expect, it } from "vitest";

import { isLoaded } from "../../src/project/loaded-files";
import { readProject } from "../../src/project/read-project";
import { projectWith, removeProjects } from "../recipes/project-fixture";

afterAll(removeProjects);

function projectOf(manifest: object, files: Record<string, string>) {
  return readProject(projectWith({ "package.json": JSON.stringify(manifest), ...files }));
}

describe("isLoaded", () => {
  it("takes a file imported through a tsconfig paths key, package.json imports or baseUrl as loaded", () => {
    const routes = { "src/courier/routes.ts": "export const courier = 1;\n" };
    const paths = projectOf(
      {},
      {
        ...routes,
        "tsconfig.json": '{ "compilerOptions": { "paths": { "@server/*": ["./src/*"] } } }',
        "src/server.ts": 'import { courier } from "@server/courier/routes";\n',
      },
    );
    const imports = projectOf(
      { imports: { "#courier/*": "./src/courier/*.ts" } },
      {
        ...routes,
        "src/server.ts": 'import { courier } from "#courier/routes";\n',
      },
    );
    const base = projectOf(
      {},
      {
        ...routes,
        "tsconfig.json": '{ "compilerOptions": { "baseUrl": "src" } }',
        "src/server.ts": 'import { courier } from "courier/routes";\n',
      },
    );
    const unknown = projectOf(
      {},
      {
        ...routes,
        "src/server.ts": 'import { courier } from "@server/courier/routes";\n',
      },
    );

    expect(isLoaded(paths, "src/courier/routes.ts")).toBe(true);
    expect(isLoaded(imports, "src/courier/routes.ts")).toBe(true);
    expect(isLoaded(base, "src/courier/routes.ts")).toBe(true);
    expect(isLoaded(unknown, "src/courier/routes.ts")).toBe(false);
  });
});
