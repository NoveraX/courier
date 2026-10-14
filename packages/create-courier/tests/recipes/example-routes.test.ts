/**
 * The routes module a new project starts with is the one Courier writes
 * from the example API's marks, byte for byte, so neither Studio's first run
 * nor `courier-cli routes --check` finds anything to write again — and its
 * import of the config carries the extension the project's imports carry.
 */
import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import { routesOf } from "@noverax/courier/internal";
import { afterAll, describe, expect, it } from "vitest";

import { routesModuleText } from "../../../cli/src/routes-module/routes-module-text";
import { exampleRoutes } from "../../src/recipes/shared/example-routes";
import { contextOf, manifest, projectWith, removeProjects } from "./project-fixture";

afterAll(removeProjects);

const { endpoint } = courier();

/* The example API's endpoints and marks, as `exampleApi` writes them for a proxied app. */
const exampleApi = defineApi({
  baseURL: "http://localhost:7001",
  expose: true,
  groups: {
    users: defineGroup({
      prefix: "users",
      endpoints: { list: endpoint.get(""), get: endpoint.get(":id"), create: endpoint.post("") },
    }),
  },
});

describe("exampleRoutes", () => {
  it("writes the module Studio writes from the example API's marks", () => {
    const root = projectWith({
      "package.json": manifest({ next: "16.0.0" }),
      "tsconfig.json": "{}",
    });

    const routes = exampleRoutes(contextOf(root, "next"));

    expect(routes.path).toBe("courier.routes.ts");
    expect(routes.content).toBe(
      routesModuleText({
        configName: "courier.config.ts",
        configSpecifier: "./courier.config",
        sources: [{ exportName: "apiRoutes", routes: routesOf(exampleApi, "api") }],
      }),
    );
  });

  it("imports the config with the extension the project's imports carry", () => {
    const root = projectWith({
      "package.json": JSON.stringify({ type: "module", dependencies: { next: "16.0.0" } }),
      "tsconfig.json": JSON.stringify({ compilerOptions: { module: "NodeNext" } }),
    });

    expect(exampleRoutes(contextOf(root, "next")).content).toContain(
      'import type config from "./courier.config.js";',
    );
  });
});
