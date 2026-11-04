import { afterAll, describe, expect, it } from "vitest";

import { routesClientEdits } from "../../src/routes-setup/routes-clients";
import { contextOf, manifest, projectWith, removeProjects } from "../recipes/project-fixture";

afterAll(removeProjects);

const MODULE = { path: "courier.routes.ts", sources: new Map([["apiRoutes", "api"]]) };

/* The edit of a client module in a SvelteKit app whose routes module is courier.routes.ts, and what it makes of the module. */
function moved(client: string, path = "src/lib/courier/caller.ts", module = MODULE) {
  const root = projectWith({
    "package.json": manifest({ "@sveltejs/kit": "^3.0.0", svelte: "^5.57.1" }),
    "tsconfig.json": "{}",
    "courier.config.ts": "export default defineConfig({ sources: { api } });\n",
    "courier.routes.ts":
      "// Written by Courier from courier.config.ts. Do not edit it:\nexport const apiRoutes = {};\n",
    [path]: client,
  });
  const edits = routesClientEdits(contextOf(root, "@sveltejs/kit"), module);
  return { paths: edits.map((edit) => edit.path), after: edits[0]?.change(client) };
}

describe("routesClientEdits", () => {
  it("reads the routes of the module create-courier writes from the plugin's, and registers the config there", () => {
    const client = `import { createProxyCaller } from "@noverax/courier";

import { apiRoutes } from "../../../courier.routes";

/** Your API's client for the browser. */
export const courier = createProxyCaller(apiRoutes);
`;

    expect(moved(client)).toEqual({
      paths: ["src/lib/courier/caller.ts"],
      after: `import { createProxyCaller } from "@noverax/courier";
import { routes } from "@noverax/courier/routes";
import type config from "../../../courier.config";

/* Types \`routes\` from the config: one registration for the app. */
declare module "@noverax/courier/routes" {
  interface Register {
    config: typeof config;
  }
}

/** Your API's client for the browser. */
export const courier = createProxyCaller(routes.api);
`,
    });
  });

  it("follows the name a module imports the routes under, and a shorthand property", () => {
    const client = `import { createProxyQueryCaller } from "@noverax/courier-react";
import { apiRoutes as shop } from "../../../courier.routes";

export const q = createProxyQueryCaller(shop);
export const all = { shop };
`;
    const after = moved(client).after;

    expect(after).toContain("export const q = createProxyQueryCaller(routes.api);");
    expect(after).toContain("export const all = { shop: routes.api };");
    expect(after).not.toContain("courier.routes");
  });

  it("imports the plugin's routes and the config's type under other names where the module binds theirs", () => {
    const client = `import { createProxyCaller } from "@noverax/courier";
import { apiRoutes } from "../../../courier.routes";
import { config } from "./settings";

export const routes = [config];
export const courier = createProxyCaller(apiRoutes);
`;
    const after = moved(client).after;

    expect(after).toContain('import { routes as courierRoutes } from "@noverax/courier/routes";');
    expect(after).toContain('import type courierConfig from "../../../courier.config";');
    expect(after).toContain("config: typeof courierConfig;");
    expect(after).toContain("createProxyCaller(courierRoutes.api)");
  });

  it("reads a source whose name is not one a dot can follow by its quoted name", () => {
    const module = { path: "courier.routes.ts", sources: new Map([["myApiRoutes", "my-api"]]) };
    const client = `import { myApiRoutes } from "../../../courier.routes";\n\nexport const caller = createProxyCaller(myApiRoutes);\n`;

    expect(moved(client, "src/lib/courier/caller.ts", module).after).toContain(
      'createProxyCaller(routes["my-api"])',
    );
  });

  it("leaves a module that takes the routes module whole to the person", () => {
    const client = `import * as all from "../../../courier.routes";\n\nexport const caller = createProxyCaller(all.apiRoutes);\n`;

    expect(moved(client).after).toBeUndefined();
  });

  it("leaves a module that registers the config already with its registration", () => {
    const client = `import { apiRoutes } from "../../../courier.routes";
import type config from "../../../courier.config";

declare module "@noverax/courier/routes" {
  interface Register {
    config: typeof config;
  }
}

export const caller = createProxyCaller(apiRoutes);
`;
    const after = moved(client).after ?? "";

    expect(after.match(/declare module/g)).toHaveLength(1);
    expect(after).toContain("createProxyCaller(routes.api)");
  });

  it("edits no module that does not import the routes module", () => {
    expect(moved('import { other } from "./other";\n\nexport const a = other;\n').paths).toEqual(
      [],
    );
  });
});
