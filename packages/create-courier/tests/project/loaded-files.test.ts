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

  it("takes React Router's and Remix's root and entries as loaded, and a module beside them only once imported", () => {
    for (const marker of ["@react-router/dev", "@remix-run/dev"]) {
      const project = projectOf(
        { devDependencies: { [marker]: "^7.9.0" } },
        {
          "app/entry.server.tsx": "export default function handleRequest() {}\n",
          "app/lib/boot.ts": "export {};\n",
        },
      );

      expect(isLoaded(project, "app/entry.server.tsx")).toBe(true);
      expect(isLoaded(project, "app/root.tsx")).toBe(true);
      expect(isLoaded(project, "app/lib/boot.ts")).toBe(false);
    }
  });

  it("takes the worker a wrangler config names as loaded", () => {
    const worker = { "src/worker.ts": "export default {};\n" };

    expect(
      isLoaded(
        projectOf({}, { ...worker, "wrangler.toml": 'name = "api"\nmain = "src/worker.ts"\n' }),
        "src/worker.ts",
      ),
    ).toBe(true);
    expect(
      isLoaded(
        projectOf(
          {},
          { ...worker, "wrangler.jsonc": '{ // the worker\n "main": "./src/worker.ts" }' },
        ),
        "src/worker.ts",
      ),
    ).toBe(true);
    expect(isLoaded(projectOf({}, worker), "src/worker.ts")).toBe(false);
  });

  it("takes a file in the folder Fastify's autoload is given as loaded, and not one in another", () => {
    const app = (folder: string) =>
      `import AutoLoad from "@fastify/autoload";\nimport { join } from "node:path";\n\nexport default async function app(fastify) {\n  await fastify.register(AutoLoad, { dir: join(import.meta.dirname, "${folder}") });\n}\n`;
    const files = { "src/modules/courier.ts": "export default async function courier() {}\n" };
    const manifest = { dependencies: { fastify: "^5.6.0", "@fastify/autoload": "^6.0.0" } };

    expect(
      isLoaded(
        projectOf(manifest, { ...files, "src/app.ts": app("modules") }),
        "src/modules/courier.ts",
      ),
    ).toBe(true);
    expect(
      isLoaded(
        projectOf(manifest, { ...files, "src/app.ts": app("plugins") }),
        "src/modules/courier.ts",
      ),
    ).toBe(false);
  });
});
