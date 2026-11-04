import { afterAll, describe, expect, it } from "vitest";

import { routeConfigSteps } from "../../src/recipes/edits/route-config";
import { contextOf, manifest, projectWith, removeProjects } from "./project-fixture";

afterAll(removeProjects);

/* A React Router app set up already, its proxy route written as given. */
function appWith(route: string) {
  return contextOf(
    projectWith({
      "package.json": manifest({ "@react-router/dev": "^7.9.0", react: "19.2.0" }),
      "tsconfig.json": "{}",
      "courier.config.ts":
        'import { api } from "./app/api";\n\nexport default defineConfig({ sources: { api } });\n',
      "app/routes/api.request.ts": route,
    }),
    "@react-router/dev",
  );
}

describe("routeConfigSteps", () => {
  it("names a route that reads the config at its top level, which ships the config with a page", () => {
    const steps = routeConfigSteps(
      appWith(
        'import { registerSources } from "@noverax/courier";\nimport { courierHandler } from "@noverax/courier-remix";\nimport config from "../../courier.config";\n\nregisterSources(config.sources);\n\nconst handler = courierHandler();\nexport const loader = handler;\nexport const action = handler;\n',
      ),
    );

    expect(steps.map((step) => step.file)).toEqual(["app/routes/api.request.ts"]);
    expect(steps[0]?.lines).toContain("  registerSources(config.sources);");
  });

  it("leaves a route that reads the config in its loader's and action's code alone", () => {
    const steps = routeConfigSteps(
      appWith(
        'import { registerSources } from "@noverax/courier";\nimport { courierHandler } from "@noverax/courier-remix";\n\nimport config from "../../courier.config";\n\nfunction servingHandler() {\n  registerSources(config.sources);\n  return courierHandler();\n}\n\nconst handler = servingHandler();\n\nexport const loader = handler;\nexport const action = handler;\n',
      ),
    );

    expect(steps).toEqual([]);
  });

  it("leaves a route that takes the config's type alone", () => {
    const steps = routeConfigSteps(
      appWith(
        'import { courierHandler } from "@noverax/courier-remix";\nimport type config from "../../courier.config";\n\nexport type Config = typeof config;\nexport const loader = courierHandler();\n',
      ),
    );

    expect(steps).toEqual([]);
  });
});
