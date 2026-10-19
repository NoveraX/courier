/**
 * An endpoint declared from traffic: Studio reads an OpenAPI document from a
 * source's recorded calls — each route with its parameters named after the
 * variables they carried, its query or body, and its answer, each schema
 * merged from every call — which the import wizard turns into code as it
 * does any specification. A path a browser recorded is read against the
 * page's origin. A stream, a call with no answer and one with no address
 * are left out.
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
      schemaOfSamples(
        [
          { id: "a", at: "2026-10-09T01:00:00Z", tags: ["x"], seller: { name: "Ada" } },
          {
            id: "b",
            at: "2026-10-10T02:00:00Z",
            note: null,
            tags: [1],
            seller: { name: "Bo", rating: 4 },
          },
        ],
        "answers",
      ),
    ).toEqual({
      type: "object",
      properties: {
        id: { type: "string", description: "Inferred from traffic: in both answers." },
        at: {
          type: "string",
          format: "date-time",
          description: "Inferred from traffic: in both answers.",
        },
        tags: {
          type: "array",
          items: { anyOf: [{ type: "string" }, { type: "number" }] },
          description: "Inferred from traffic: in both answers.",
        },
        seller: {
          type: "object",
          properties: {
            name: { type: "string", description: "Inferred from traffic: in both seller objects." },
            rating: {
              type: "number",
              description: "Inferred from traffic: in 1 of 2 seller objects.",
            },
          },
          required: ["name"],
          description: "Inferred from traffic: in both answers.",
        },
        note: { type: "null", description: "Inferred from traffic: in 1 of 2 answers." },
      },
      required: ["id", "at", "tags", "seller"],
    });
    expect(schemaOfSamples(["a", null])).toEqual({ type: ["string", "null"] });
    expect(schemaOfSamples([{ id: "a" }], "requests")).toMatchObject({
      properties: { id: { description: "Inferred from traffic: from the one request seen." } },
    });
    expect(
      schemaOfSamples([{ lines: [{ sku: "a" }, { sku: "b", qty: 2 }, { sku: "c" }] }], "answers"),
    ).toMatchObject({
      properties: {
        lines: {
          description: "Inferred from traffic: from the one answer seen.",
          items: {
            properties: {
              sku: { description: "Inferred from traffic: in all 3 items." },
              qty: { description: "Inferred from traffic: in 1 of 3 items." },
            },
          },
        },
      },
    });
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
      {
        name: "category",
        in: "query",
        required: true,
        schema: { type: "string" },
        description: "Inferred from traffic: sent in the one call.",
      },
      {
        name: "page",
        in: "query",
        required: true,
        schema: { type: "number" },
        description: "Inferred from traffic: sent in the one call.",
      },
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
    expect(code).toMatch(/\/\*\* Inferred from traffic: in \d+ of \d+ answers\. \*\/\s*\n\s*note/);
    expect(spec.document.components).toMatchObject({
      schemas: { ProductsListItem: { type: "object", properties: { id: { type: "string" } } } },
    });
    expect(code).toMatch(
      /export type ProductsListItem = \{\s*\n\s*\/\*\* Inferred from traffic: [^*]+ \*\/\s*\n\s*id: string;/,
    );
    expect(code).toContain("z.array(ProductsListItemSchema)");
  });
});

describe("an OpenAPI document read from calls a page made by path", () => {
  const byPath = [
    call({ url: "/api/products/p_1", origin: "https://app.example" }),
    call({
      method: "list",
      url: "/api/products?page=2",
      origin: "https://app.example",
      variables: { page: 2 },
    }),
  ];

  it("reads a path against the origin of the page that made it", () => {
    const spec = openapiFromTraffic("shop", byPath);

    expect(spec).toMatchObject({ endpoints: 2, calls: 2 });
    expect(spec.document.servers).toEqual([{ url: "https://app.example/api" }]);
  });

  it("names the server by its path alone when no origin is known", () => {
    const spec = openapiFromTraffic(
      "shop",
      byPath.map(({ origin: _origin, ...rest }) => rest),
    );

    expect(spec.document.servers).toEqual([{ url: "/api" }]);
    expect(spec.endpoints).toBe(2);
  });

  it("leaves out and counts a call whose address is neither a URL nor a path, and reads the rest", () => {
    const spec = openapiFromTraffic("shop", [
      ...byPath,
      call({ url: "products" }),
      call({ url: undefined }),
    ]);

    expect(spec).toMatchObject({
      endpoints: 2,
      calls: 2,
      leftOut: { unaddressed: 2, unanswered: 0 },
    });
  });

  it("never throws, whatever the address", () => {
    const odd = [
      "http://[::1",
      "/%zz",
      "javascript:alert(1)",
      "pets",
      "//cdn.example/x",
      "",
      "data:,x",
    ];

    expect(() =>
      openapiFromTraffic(
        "shop",
        odd.map((url) => call({ url })),
      ),
    ).not.toThrow();
    expect(
      openapiFromTraffic(
        "shop",
        odd.map((url) => call({ url })),
      ).leftOut.unaddressed,
    ).toBe(6);
  });

  it("keeps the server of the first absolute call", () => {
    const spec = openapiFromTraffic("shop", [call({}), ...byPath]);

    expect(spec.document.servers).toEqual([{ url: "https://shop.example/api" }]);
  });
});
