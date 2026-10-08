/**
 * An endpoint declared from traffic: Studio reads an OpenAPI document from a
 * source's recorded calls — each route with its parameters named after the
 * variables they carried, its query or body, and its answer, each schema
 * merged from every call — which the import wizard turns into code as it
 * does any specification. A stream and a call with no answer are left out.
 */
import { describe, expect, it } from "vitest";

import { DEFAULT_OPTIONS, generateCode } from "../src/apis";
import { parseSpec } from "../src/apis/parser/parse-spec";
import {
  openapiFromTraffic,
  type TrafficCall,
} from "../src/server/traffic-spec/openapi-from-traffic";
import { pathTemplate } from "../src/server/traffic-spec/path-template";
import { schemaOfSamples } from "../src/server/traffic-spec/sample-schema";

function call(fields: Partial<TrafficCall>): TrafficCall {
  return {
    group: "products",
    method: "get",
    httpMethod: "GET",
    url: "https://shop.example/api/products/p_1",
    variables: { id: "p_1" },
    status: 200,
    data: { id: "p_1", price: 12 },
    dataCut: false,
    transport: "http",
    ...fields,
  };
}

const TRAFFIC: TrafficCall[] = [
  call({}),
  call({
    url: "https://shop.example/api/products/p_2",
    variables: { id: "p_2" },
    data: { id: "p_2", price: 9.5, note: null, updatedAt: "2026-10-09T01:00:00Z" },
  }),
  call({
    method: "list",
    url: "https://shop.example/api/products?category=audio&page=2",
    variables: { category: "audio", page: 2 },
    data: [{ id: "p_1" }],
  }),
  call({
    group: "cart",
    method: "add",
    httpMethod: "POST",
    url: "https://shop.example/api/cart/ada/items",
    variables: { shopper: "ada", sku: "HO-1", qty: 2 },
    status: 201,
    data: { lines: 1 },
  }),
  call({ group: "live", method: "deals", transport: "sse", url: undefined, status: undefined }),
  call({ status: undefined }),
];

describe("a schema read from samples", () => {
  it("merges every sample: fields required when all held them, null as nullable, formats all strings had", () => {
    expect(
      schemaOfSamples([
        { id: "a", at: "2026-10-09T01:00:00Z", tags: ["x"] },
        { id: "b", at: "2026-10-10T02:00:00Z", note: null, tags: [1] },
      ]),
    ).toEqual({
      type: "object",
      properties: {
        id: { type: "string" },
        at: { type: "string", format: "date-time" },
        tags: { type: "array", items: { anyOf: [{ type: "string" }, { type: "number" }] } },
        note: { type: "null" },
      },
      required: ["id", "at", "tags"],
    });
    expect(schemaOfSamples(["a", null])).toEqual({ type: ["string", "null"] });
  });
});

describe("a route read from calls", () => {
  it("names a parameter after the variable it carried, and numbers one no variable named", () => {
    expect(
      pathTemplate([
        { segments: ["orders", "o_1", "lines", "3"], variables: { id: "o_1" } },
        { segments: ["orders", "o_2", "lines", "4"], variables: { id: "o_2" } },
      ]),
    ).toEqual({ path: "/orders/{id}/lines/{param2}", params: ["id", "param2"] });
    expect(pathTemplate([{ segments: ["products", "p_9"], variables: { id: "p_9" } }])).toEqual({
      path: "/products/{id}",
      params: ["id"],
    });
  });
});

describe("an OpenAPI document read from traffic", () => {
  const spec = openapiFromTraffic("shop", TRAFFIC);

  it("holds each endpoint once, under the API's base path, and counts what it left out", () => {
    expect(spec).toMatchObject({ endpoints: 3, calls: 4, leftOut: { streams: 1, unanswered: 1 } });
    expect(spec.document.servers).toEqual([{ url: "https://shop.example/api" }]);
    expect(Object.keys(spec.document.paths as object).sort()).toEqual([
      "/cart/{shopper}/items",
      "/products",
      "/products/{id}",
    ]);
  });

  it("reads a read's query and a write's body, typed by the variables they carried", () => {
    const paths = spec.document.paths as Record<string, Record<string, Record<string, unknown>>>;

    expect(paths["/products"]?.get?.parameters).toEqual([
      { name: "category", in: "query", required: true, schema: { type: "string" } },
      { name: "page", in: "query", required: true, schema: { type: "number" } },
    ]);
    expect(paths["/cart/{shopper}/items"]?.post).toMatchObject({
      operationId: "add",
      tags: ["cart"],
      requestBody: {
        content: {
          "application/json": {
            schema: { type: "object", required: ["sku", "qty"] },
          },
        },
      },
      responses: { 201: { description: "As 1 recorded call answered" } },
    });
  });

  it("imports as any specification does, into typed endpoints named as the app named them", () => {
    const parsed = parseSpec(JSON.stringify(spec.document));
    const files = generateCode(parsed, {
      ...DEFAULT_OPTIONS,
      outputDir: "src/api",
      sourceName: "shop",
    });
    const code = files.map((file) => file.content).join("\n");

    expect(parsed.groups.map((group) => [group.name, group.endpoints.map((e) => e.name)])).toEqual(
      expect.arrayContaining([
        ["products", expect.arrayContaining(["get", "list"])],
        ["cart", ["add"]],
      ]),
    );
    expect(code).toContain("updatedAt");
    expect(code).toMatch(/note[^\n]*nullable|note[^\n]*null/);
  });
});
