/**
 * A routes module composed from a config as it loaded: each source a page
 * may call an endpoint of, in the order their names sort, by the rules the
 * proxy applies; typed by the config when both are TypeScript, through an
 * import written as the project writes its relative imports.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CourierConfig } from "@noverax/courier/config";
import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { composeRoutesModule } from "../../src/routes-module/compose-routes-module";

const { endpoint, stream } = courier();

const shop = defineApi({
  baseURL: "https://shop.example.com",
  expose: true,
  groups: {
    products: defineGroup({
      prefix: "products",
      endpoints: {
        list: endpoint.get("").cache({ revalidate: 60 }),
        create: endpoint.post(""),
        purge: endpoint.del("").expose(false),
      },
    }),
  },
  endpoints: { feed: stream.get("feed") },
});

const internal = defineApi({
  baseURL: "https://internal.example.com",
  expose: false,
  endpoints: { health: endpoint.get("health") },
});

const admin = defineApi({
  baseURL: "https://admin.example.com",
  endpoints: { audit: endpoint.get("audit").expose() },
});

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "courier-compose-routes-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function loaded(sources: Record<string, object>, configName = "courier.config.ts") {
  return { config: { sources } as CourierConfig, configFile: join(root, configName) };
}

describe("composeRoutesModule", () => {
  it("writes each source a page may call an endpoint of, in name order, and counts them", () => {
    const { module } = composeRoutesModule(
      root,
      loaded({ shop, internal, admin }),
      "courier.routes.ts",
    );

    expect(module).toMatchObject({
      path: "courier.routes.ts",
      sources: ["admin", "shop"],
      endpoints: 4,
    });
    expect(module?.content).toContain('import type config from "./courier.config";');
    expect(module?.content.indexOf("const adminEndpoints")).toBeLessThan(
      module?.content.indexOf("const shopEndpoints") ?? 0,
    );
    expect(module?.content).toContain('  "products.list": { type: "query", get: true },');
    expect(module?.content).toContain('  "products.create": { type: "mutation" },');
    expect(module?.content).toContain('  "feed": { transport: "sse" },');
    expect(module?.content).not.toContain("purge");
    expect(module?.content).not.toContain("internal");
  });

  it("imports the config from a module in a folder by the path up to it", () => {
    const { module } = composeRoutesModule(root, loaded({ shop }), "src/lib/courier.routes.ts");

    expect(module?.content).toContain('import type config from "../../courier.config";');
  });

  it("names the config by the file it runs as where the project's imports resolve as Node does", () => {
    writeFileSync(join(root, "package.json"), JSON.stringify({ type: "module" }));
    writeFileSync(
      join(root, "tsconfig.json"),
      JSON.stringify({ compilerOptions: { module: "NodeNext" } }),
    );
    mkdirSync(join(root, "src"));

    const ts = composeRoutesModule(root, loaded({ shop }), "src/courier.routes.ts").module;
    const mts = composeRoutesModule(
      root,
      loaded({ shop }, "courier.config.mts"),
      "courier.routes.mts",
    ).module;

    expect(ts?.content).toContain('import type config from "../courier.config.js";');
    expect(mts?.content).toContain('import type config from "./courier.config.mjs";');
  });

  it("writes the routes alone, with no types, for a JavaScript config or module", () => {
    const fromJs = composeRoutesModule(
      root,
      loaded({ shop }, "courier.config.js"),
      "courier.routes.js",
    ).module;
    const intoJs = composeRoutesModule(root, loaded({ shop }), "courier.routes.mjs").module;

    for (const module of [fromJs, intoJs]) {
      expect(module?.content).not.toContain("import type");
      expect(module?.content).toContain("export const shopRoutes = {");
    }
  });

  it("writes a module that exports nothing when no source has an endpoint a page may call", () => {
    const { module } = composeRoutesModule(root, loaded({ internal }), "courier.routes.ts");

    expect(module).toMatchObject({ sources: [], endpoints: 0 });
    expect(module?.content).toContain("export {};");
  });

  it("says why when two sources would export their routes under one name", () => {
    const composed = composeRoutesModule(
      root,
      loaded({ "admin-api": admin, adminApi: shop }),
      "courier.routes.ts",
    );

    expect(composed).toEqual({
      module: null,
      problem:
        'the sources "admin-api" and "adminApi" would both be exported as adminApiRoutes; rename one of them',
    });
  });
});
