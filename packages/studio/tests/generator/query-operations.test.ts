/**
 * OpenAPI 3.2's QUERY operation, imported and called: the operation is read
 * from the path item's `query` field, or from `additionalOperations` where a
 * specification wrote it there, and the generated endpoint asks with a body
 * as a read — its kind, and every request a real upstream receives, directly
 * and through the proxy. A verb the builder has no counterpart for is listed
 * as left out, never lost.
 */
import { createProxyCaller } from "@noverax/courier";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { generateCode } from "../../src/apis/generator";
import { parseSpec } from "../../src/apis/parser";
import type { ParsedSpec } from "../../src/apis/parser/types";
import {
  compileProject,
  endpointAt,
  loadGenerated,
  removeProjects,
  STRICT,
  writeProject,
} from "../helpers/generated-project";
import { type ProxyServer, startProxyServer } from "../helpers/proxy-server";
import { startUpstreamServer, type UpstreamServer } from "../helpers/upstream-server";

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const json = (schema: unknown) => ({ content: { "application/json": { schema } } });
const ok = { "200": { description: "ok", ...json(ref("Item")) } };
const page = { name: "page", in: "query", required: false, schema: { type: "string" } };
const itemId = { name: "item_id", in: "path", required: true, schema: { type: "integer" } };

function spec(origin: string): ParsedSpec {
  return parseSpec(
    JSON.stringify({
      openapi: "3.2.0",
      info: { title: "Shop", version: "1" },
      servers: [{ url: `${origin}/v1` }],
      paths: {
        "/items/search": {
          query: {
            operationId: "searchItems",
            tags: ["items"],
            parameters: [page],
            requestBody: json(ref("Item")),
            responses: ok,
          },
        },
        "/items/lookup": {
          additionalOperations: {
            QUERY: {
              operationId: "lookupItems",
              tags: ["items"],
              requestBody: json(ref("Item")),
              responses: ok,
            },
          },
        },
        "/items/{item_id}": {
          get: { operationId: "getItem", tags: ["items"], parameters: [itemId], responses: ok },
          additionalOperations: {
            COPY: { operationId: "copyItem", tags: ["items"], parameters: [itemId], responses: ok },
          },
        },
        "/items/report": {
          get: {
            operationId: "itemReport",
            tags: ["items"],
            responses: {
              "200": {
                description: "csv",
                content: { "text/csv": { schema: { type: "string" } } },
              },
            },
          },
        },
      },
      components: {
        schemas: {
          Item: { type: "object", required: ["name"], properties: { name: { type: "string" } } },
        },
      },
    }),
  );
}

const CALLS: [string, unknown, string][] = [
  ["searchItems", { name: "thing", page: "2" }, 'QUERY /v1/items/search?page=2 {"name":"thing"}'],
  ["lookupItems", { name: "thing" }, 'QUERY /v1/items/lookup {"name":"thing"}'],
];

let upstream: UpstreamServer;

beforeAll(async () => {
  upstream = await startUpstreamServer({ name: "thing" });
});

afterAll(async () => {
  await upstream.close();
  removeProjects("query-operations");
});

function generate() {
  return generateCode(spec(upstream.origin), { type: "openapi", outputDir: "src/api" }, "shop");
}

function sent(): string[] {
  return upstream.requests.map((r) => {
    const query = r.query.map(([key, value]) => `${key}=${value}`).join("&");
    return `${r.method} ${r.path}${query ? `?${query}` : ""} ${r.body}`;
  });
}

/* The kind the generated source gives one of its endpoints. */
function kindOf(name: string): unknown {
  let value: unknown = loadGenerated(generate(), "src/api/shop/source.ts").shop;
  for (const key of ["options", "groups", "items", name, "kind"]) {
    value = typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;
  }
  return value;
}

describe("an OpenAPI 3.2 specification with QUERY operations", () => {
  it("imports each as a QUERY, from its field or from additionalOperations", () => {
    const methods = spec(upstream.origin)
      .groups.flatMap((group) => group.endpoints)
      .map((endpoint) => [endpoint.name, endpoint.httpMethod]);

    expect(methods).toEqual(
      expect.arrayContaining([
        ["searchItems", "query"],
        ["lookupItems", "query"],
      ]),
    );
  });

  it("lists a verb the builder cannot express as left out", () => {
    expect(spec(upstream.origin).skipped).toEqual([
      expect.objectContaining({ method: "COPY", path: "/items/{item_id}" }),
    ]);
  });

  it("generates reads, those addressed by a closure included", () => {
    expect(kindOf("searchItems")).toBe("query");
    expect(kindOf("lookupItems")).toBe("query");
    expect(kindOf("itemReport")).toBe("query");
  });

  it.each(CALLS)("sends %s as a QUERY with its body", async (name, variables, request) => {
    const { shopApi } = loadGenerated(generate(), "src/api/shop/index.ts");
    upstream.requests.length = 0;

    await endpointAt(shopApi, "items", name)(variables);

    expect(sent()).toEqual([request]);
  });

  it("compiles with every unused name reported", () => {
    const dir = writeProject("query-operations/zod", generate());
    const strictest = { ...STRICT, noUnusedLocals: true, noUnusedParameters: true };

    expect(compileProject(dir, ["src/api/shop/index.ts"], strictest)).toEqual([]);
  }, 60_000);
});

describe("a generated QUERY through the proxy", () => {
  let proxy: ProxyServer;

  beforeAll(async () => {
    proxy = await startProxyServer(loadGenerated(generate(), "src/api/shop/source.ts"));
  });

  afterAll(async () => {
    await proxy.close();
  });

  it.each(CALLS)("reaches the upstream as a QUERY: %s", async (name, variables, request) => {
    const caller = createProxyCaller("shop", { proxyPath: { http: proxy.url } });
    upstream.requests.length = 0;

    await endpointAt(caller, "items", name)(variables);

    expect(sent()).toEqual([request]);
  });
});
