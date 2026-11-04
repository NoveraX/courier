import { afterAll, describe, expect, it } from "vitest";

import { readProject } from "../../src/project/read-project";
import { isRoutesModule, routesModules } from "../../src/routes-setup/routes-modules";
import { manifest, projectWith, removeProjects } from "../recipes/project-fixture";

afterAll(removeProjects);

const TYPED = `// Written by Courier from courier.config.ts. Do not edit it:
// \`courier-cli routes\` writes it again from the endpoints marked .expose().

import type { CourierRoutes, RouteMap } from "@noverax/courier/define";

import type config from "./courier.config";

type Sources = (typeof config)["sources"];

const shopEndpoints = {
  "items.list": { type: "query" },
} as const satisfies RouteMap<Sources["shop"]>;

/** What a page's proxy client may call of \`shop\`, and how it reaches each endpoint. */
export const shopRoutes: CourierRoutes<Sources["shop"], typeof shopEndpoints> = {
  source: "shop",
  endpoints: shopEndpoints,
};
`;

const UNTYPED = `// Written by Courier from courier.config.js. Do not edit it:
// \`courier-cli routes\` writes it again from the endpoints marked .expose().

/** What a page's proxy client may call of \`my-api\`, and how it reaches each endpoint. */
export const myApiRoutes = {
  source: "my-api",
  endpoints: {
    "users.list": { type: "query" },
  },
};
`;

describe("routesModules", () => {
  it("finds each routes module Courier wrote, where studio.routes puts it too, with each export's source", () => {
    const project = readProject(
      projectWith({
        "package.json": manifest({}),
        "courier.routes.ts": TYPED,
        "src/lib/routes.js": UNTYPED,
        "src/lib/other.ts": 'export const shopRoutes = { source: "shop" };\n',
      }),
    );

    expect(
      routesModules(project)
        .map((module) => [module.path, [...module.sources]])
        .sort(),
    ).toEqual([
      ["courier.routes.ts", [["shopRoutes", "shop"]]],
      ["src/lib/routes.js", [["myApiRoutes", "my-api"]]],
    ]);
  });

  it("knows a module Courier wrote by its first line", () => {
    expect(isRoutesModule(TYPED)).toBe(true);
    expect(isRoutesModule("export const shopRoutes = {};\n")).toBe(false);
  });
});
