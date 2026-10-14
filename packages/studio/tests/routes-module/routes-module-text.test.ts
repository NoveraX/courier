/**
 * The text of a routes module: a TypeScript one holds each source's routes
 * to the API it was written from and types the client by it, importing the
 * config as a type alone; a JavaScript one is the routes alone; and one with
 * no endpoint a page may call exports nothing.
 */
import { describe, expect, it } from "vitest";

import { routesModuleText } from "../../src/server/routes-module/routes-module-text";

const HEADER = [
  "// Written by Courier Studio from courier.config.ts. Do not edit it:",
  "// `courier-studio routes` writes it again from the endpoints marked .expose().",
];

const shop = {
  exportName: "shopRoutes",
  routes: {
    source: "shop",
    endpoints: {
      "cart.add": { type: "mutation" },
      "live.chat": { transport: "ws", bidirectional: true },
      "live.feed": { transport: "sse" },
      "products.list": { type: "query", get: true },
      search: { type: "query" },
    },
    cancelPrevious: ["search"],
    coalesce: false,
  },
} as const;

describe("routesModuleText", () => {
  it("writes a TypeScript module that holds each source's routes to the API they were written from", () => {
    const text = routesModuleText({
      configName: "courier.config.ts",
      configSpecifier: "../courier.config",
      sources: [shop],
    });

    expect(text).toBe(
      [
        ...HEADER,
        "",
        'import type { CourierRoutes, RouteMap } from "@noverax/courier/define";',
        "",
        'import type config from "../courier.config";',
        "",
        'type Sources = (typeof config)["sources"];',
        "",
        "const shopEndpoints = {",
        '  "cart.add": { type: "mutation" },',
        '  "live.chat": { transport: "ws", bidirectional: true },',
        '  "live.feed": { transport: "sse" },',
        '  "products.list": { type: "query", get: true },',
        '  "search": { type: "query" },',
        '} as const satisfies RouteMap<Sources["shop"]>;',
        "",
        "/** What a page's proxy client may call of `shop`, and how it reaches each endpoint. */",
        'export const shopRoutes: CourierRoutes<Sources["shop"], typeof shopEndpoints> = {',
        '  source: "shop",',
        "  endpoints: shopEndpoints,",
        '  cancelPrevious: ["search"],',
        "  coalesce: false,",
        "};",
        "",
      ].join("\n"),
    );
  });

  it("writes a JavaScript module of the routes alone, with no types to import", () => {
    const text = routesModuleText({ configName: "courier.config.ts", sources: [shop] });

    expect(text).toBe(
      [
        ...HEADER,
        "",
        "/** What a page's proxy client may call of `shop`, and how it reaches each endpoint. */",
        "export const shopRoutes = {",
        '  source: "shop",',
        "  endpoints: {",
        '    "cart.add": { type: "mutation" },',
        '    "live.chat": { transport: "ws", bidirectional: true },',
        '    "live.feed": { transport: "sse" },',
        '    "products.list": { type: "query", get: true },',
        '    "search": { type: "query" },',
        "  },",
        '  cancelPrevious: ["search"],',
        "  coalesce: false,",
        "};",
        "",
      ].join("\n"),
    );
  });

  it("writes each source in turn, a blank line between them", () => {
    const api = {
      exportName: "apiRoutes",
      routes: { source: "api", endpoints: { health: { type: "query" } } },
    } as const;

    const text = routesModuleText({
      configName: "courier.config.ts",
      configSpecifier: "./courier.config",
      sources: [api, shop],
    });

    expect(text).toContain("};\n\nconst shopEndpoints = {");
    expect(text).toContain(
      'export const apiRoutes: CourierRoutes<Sources["api"], typeof apiEndpoints> = {',
    );
    expect(text.endsWith("};\n")).toBe(true);
  });

  it("exports nothing when no endpoint is marked for a page to call", () => {
    const text = routesModuleText({
      configName: "courier.config.ts",
      configSpecifier: "./courier.config",
      sources: [],
    });

    expect(text).toBe(
      [
        ...HEADER,
        "",
        "// No endpoint is marked .expose(), so a page may call none.",
        "export {};",
        "",
      ].join("\n"),
    );
  });
});
