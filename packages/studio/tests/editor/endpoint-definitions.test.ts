/**
 * Where an editor goes to an endpoint: its name in its group's `endpoints`,
 * found through the config's sources and the groups between — written in
 * another module, nested in another group, or at the source's top level —
 * with the whole declaration beside it. An endpoint no file declares has
 * no place. And where an editor adds one: each group's `endpoints` object,
 * its last endpoint, the names taken and what the file builds them with.
 */
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import type { CatalogEndpoint } from "../../src/server/editor/endpoint-catalog";
import { endpointDefinitions } from "../../src/server/editor/endpoint-definitions";
import { groupPlaces } from "../../src/server/editor/group-places";

const CONFIG = `import { defineConfig } from "@noverax/courier/config";

import { shop } from "./src/api/shop";

export default defineConfig({ sources: { shop } });
`;

const SHOP = `import { courier, defineApi, defineGroup } from "@noverax/courier/define";

import { orders } from "./orders";

const { endpoint } = courier();

const admin = defineGroup({
  prefix: "admin",
  groups: { orders },
  endpoints: { stats: endpoint.get("stats").response<unknown>() },
});

export const shop = defineApi({
  baseURL: "http://localhost:4501",
  groups: { orders, admin },
  endpoints: { health: endpoint.get("health").response<{ ok: boolean }>() },
});
`;

const ORDERS = `import { courier, defineGroup } from "@noverax/courier/define";

const { endpoint } = courier();

export const orders = defineGroup({
  prefix: "orders",
  endpoints: {
    list: endpoint.get("").response<unknown[]>(),
    place: endpoint
      .post("")
      .variables<{ sku: string }>()
      .response<{ id: string }>(),
  },
});
`;

const root = realpathSync(mkdtempSync(join(tmpdir(), "courier-definitions-")));
mkdirSync(join(root, "src/api"), { recursive: true });
writeFileSync(join(root, "courier.config.ts"), CONFIG);
writeFileSync(join(root, "src/api/shop.ts"), SHOP);
writeFileSync(join(root, "src/api/orders.ts"), ORDERS);

afterAll(() => rmSync(root, { recursive: true, force: true }));

const entry = (endpoint: string): CatalogEndpoint => ({
  source: "shop",
  endpoint,
  parts: endpoint.split("."),
  kind: "query",
});

describe("where an editor goes to an endpoint", () => {
  const definitions = endpointDefinitions(root, join(root, "courier.config.ts"), [
    entry("orders.place"),
    entry("admin.orders.list"),
    entry("admin.stats"),
    entry("health"),
    entry("orders.gone"),
  ]);
  const of = (endpoint: string) =>
    definitions.find((definition) => definition.endpoint === endpoint);

  it("finds an endpoint in a group another module writes, at its name, the whole declaration beside", () => {
    expect(of("orders.place")).toEqual({
      source: "shop",
      endpoint: "orders.place",
      file: "src/api/orders.ts",
      path: join(root, "src/api/orders.ts"),
      line: 9,
      column: 5,
      endLine: 9,
      endColumn: 10,
      span: { line: 9, column: 5, endLine: 12, endColumn: 34 },
    });
  });

  it("follows a group inside a group, and finds an endpoint at the source's top level", () => {
    expect(of("admin.orders.list")).toMatchObject({
      file: "src/api/orders.ts",
      line: 8,
      column: 5,
    });
    expect(of("admin.stats")).toMatchObject({ file: "src/api/shop.ts", line: 10, column: 16 });
    expect(of("health")).toMatchObject({ file: "src/api/shop.ts", line: 16, column: 16 });
  });

  it("gives no place to an endpoint no file declares", () => {
    expect(of("orders.gone")).toBeUndefined();
    expect(definitions).toHaveLength(4);
  });
});

describe("where an editor adds an endpoint", () => {
  const places = groupPlaces(root, join(root, "courier.config.ts"), [
    entry("orders.place"),
    entry("admin.orders.list"),
    entry("admin.stats"),
    entry("health"),
  ]);
  const of = (group: string) => places.find((place) => place.group === group);

  it("finds each group's endpoints object, its last endpoint and the names taken", () => {
    expect(of("orders")).toEqual({
      source: "shop",
      group: "orders",
      file: "src/api/orders.ts",
      path: join(root, "src/api/orders.ts"),
      open: { line: 7, column: 14 },
      close: { line: 13, column: 3 },
      last: { line: 12, column: 34, comma: true },
      names: ["list", "place"],
      builder: "endpoint",
    });
  });

  it("finds the source's own endpoints, a group's beside its groups, and a nested one", () => {
    expect(of("")).toMatchObject({
      file: "src/api/shop.ts",
      names: ["health"],
      builder: "endpoint",
    });
    expect(of("admin")).toMatchObject({ file: "src/api/shop.ts", names: ["stats"] });
    expect(of("admin.orders")).toMatchObject({
      file: "src/api/orders.ts",
      names: ["list", "place"],
    });
    expect(places).toHaveLength(4);
  });
});
