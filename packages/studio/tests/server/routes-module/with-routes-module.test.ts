/**
 * Where the proxy caller of an import takes its routes, as the config Studio
 * runs says: the routes module where `studio.routes` puts it, or — where
 * the config keeps none, as a project on Courier's plugin does — the
 * plugin's `routes`, with the config registered in the module.
 */
import type { LoadedForRoutes } from "@noverax/courier-cli/devkit";
import { describe, expect, it } from "vitest";

import type { GenerateOptions } from "../../../src/apis/generator";
import { withRoutesModule } from "../../../src/server/routes-module/with-routes-module";

const PROXY: GenerateOptions = { type: "openapi", outputDir: "src/api", generateClient: "proxy" };

function running(routes?: string | false): LoadedForRoutes {
  return {
    configFile: "/work/shop/courier.config.ts",
    config: { sources: {}, ...(routes === undefined ? {} : { studio: { routes } }) },
  };
}

describe("withRoutesModule", () => {
  it("puts the proxy caller's routes where studio.routes puts the module, or beside the config", () => {
    expect(withRoutesModule(PROXY, running("src/routes.ts"))).toEqual({
      ...PROXY,
      routesModule: "src/routes.ts",
    });
    expect(withRoutesModule({ ...PROXY, generateClient: "both" }, running()).routesModule).toBe(
      "courier.routes.ts",
    );
  });

  it("takes the routes from Courier's plugin where the config keeps no routes module", () => {
    const options = withRoutesModule(PROXY, running(false));

    expect(options.routesConfig).toBe("courier.config.ts");
    expect(options.routesModule).toBeUndefined();
  });

  it("leaves options without a proxy caller, and a project with no config running, as they are", () => {
    const direct: GenerateOptions = { ...PROXY, generateClient: "direct" };

    expect(withRoutesModule(direct, running(false))).toBe(direct);
    expect(withRoutesModule(PROXY, null)).toBe(PROXY);
  });
});
