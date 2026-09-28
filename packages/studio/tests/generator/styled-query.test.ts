/**
 * Query parameters go out in the style their specification declares. The
 * client writes a query in OpenAPI's default style, `form` exploded, so
 * Stripe's `deepObject` parameters went out as `gte=…` instead of
 * `created[gte]=…`, and `expand=…` instead of `expand[0]=…`; a Swagger 2.0
 * list, joined with commas unless it says otherwise, went out repeated.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { GenerateOptions } from "../../src/apis/generator";
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
import { type UpstreamServer, startUpstreamServer } from "../helpers/upstream-server";

const deep = (name: string, schema: unknown) => ({ name, in: "query", style: "deepObject", explode: true, schema });
const created = deep("created", {
  anyOf: [{ type: "object", properties: { gte: { type: "integer" }, lt: { type: "integer" } } }, { type: "integer" }],
});
const expand = deep("expand", { type: "array", items: { type: "string" } });
const limit = { name: "limit", in: "query", schema: { type: "integer" } };
const path = (name: string) => ({ name, in: "path", required: true, schema: { type: "string" } });
const Item = { type: "object", properties: { id: { type: "string" } } };
const json = { "200": { description: "ok", content: { "application/json": { schema: Item } } } };
const csv = { "200": { description: "ok", content: { "text/csv": { schema: { type: "string" } } } } };
const form = {
  content: {
    "application/x-www-form-urlencoded": {
      schema: { type: "object", properties: { description: { type: "string" } } },
    },
  },
};

function openApi(origin: string): ParsedSpec {
  const op = (operationId: string, parameters: unknown[], responses: unknown = json) => ({
    operationId,
    tags: ["shop"],
    parameters,
    responses,
  });
  return parseSpec(
    JSON.stringify({
      openapi: "3.0.0",
      info: { title: "Shop", version: "1" },
      servers: [{ url: `${origin}/v1` }],
      paths: {
        "/customers": { get: op("listCustomers", [created, expand, limit]) },
        "/customers/{customer}": {
          post: { ...op("updateCustomer", [path("customer"), expand]), requestBody: form },
        },
        "/customers/{customer}/tax_ids": { get: op("listTaxIds", [path("customer"), expand]) },
        "/items": {
          delete: op("deleteItems", [
            { name: "ids", in: "query", style: "pipeDelimited", explode: false, schema: { type: "array", items: { type: "string" } } },
          ]),
        },
        "/reports/{report}": {
          get: op(
            "exportReport",
            [path("report"), { name: "columns", in: "query", explode: false, schema: { type: "array", items: { type: "string" } } }],
            csv,
          ),
        },
      },
    }),
  );
}

function swagger(origin: string): ParsedSpec {
  const list = (name: string, collectionFormat?: string) => ({
    name,
    in: "query",
    type: "array",
    items: { type: "string" },
    ...(collectionFormat && { collectionFormat }),
  });
  return parseSpec(
    JSON.stringify({
      swagger: "2.0",
      info: { title: "Pets", version: "1" },
      host: origin.replace("http://", ""),
      basePath: "/v2",
      schemes: ["http"],
      paths: {
        "/pets": {
          get: {
            operationId: "findPets",
            tags: ["pets"],
            parameters: [list("tags"), list("status", "multi"), list("owners", "pipes")],
            responses: { "200": { description: "ok", schema: { type: "array", items: { type: "string" } } } },
          },
        },
      },
    }),
  );
}

const VARIANTS: [string, Partial<GenerateOptions>][] = [
  ["zod", {}],
  ["valibot", { validation: "valibot" }],
  ["arktype", { validation: "arktype" }],
  ["none", { validation: "none" }],
];

let upstream: UpstreamServer;

beforeAll(async () => {
  upstream = await startUpstreamServer(
    { id: "cus_1" },
    { "/v1/reports/r1": { contentType: "text/csv", body: "id\n1" }, "/v2/pets": { contentType: "application/json", body: "[]" } },
  );
});

afterAll(async () => {
  await upstream.close();
  removeProjects("styled-query");
});

function generated(spec: ParsedSpec, options: Partial<GenerateOptions>, name: string) {
  return generateCode(spec, { type: "openapi", outputDir: "src/api", ...options }, name);
}

function sent(): [string, string, [string, string][]][] {
  return upstream.requests.map((request) => [request.method, request.path, request.query]);
}

describe.each(VARIANTS)("a generated client validated with %s", (label, options) => {
  it("writes each query parameter in its declared style", async () => {
    const { shopApi } = loadGenerated(generated(openApi(upstream.origin), options, "shop"), "src/api/shop/index.ts");
    const call = (method: string) => endpointAt(shopApi, "shop", method);
    upstream.requests.length = 0;

    await call("listCustomers")({ created: { gte: 1680000000 }, expand: ["data.tax"], limit: 3 });
    await call("listCustomers")({ created: 1680000000 });
    await call("listTaxIds")({ customer: "cus_1", expand: ["a", "b"] });
    await call("updateCustomer")({ customer: "cus_1", expand: ["tax"], description: "vip" });
    await call("deleteItems")({ ids: ["i1", "i2"] });
    const report = await call("exportReport")({ report: "r1", columns: ["id", "name"] });

    expect(sent()).toEqual([
      ["GET", "/v1/customers", [["created[gte]", "1680000000"], ["expand[0]", "data.tax"], ["limit", "3"]]],
      ["GET", "/v1/customers", [["created", "1680000000"]]],
      ["GET", "/v1/customers/cus_1/tax_ids", [["expand[0]", "a"], ["expand[1]", "b"]]],
      ["POST", "/v1/customers/cus_1", [["expand[0]", "tax"]]],
      ["DELETE", "/v1/items", [["ids", "i1|i2"]]],
      ["GET", "/v1/reports/r1", [["columns", "id,name"]]],
    ]);
    expect(upstream.requests[3]?.body).toBe("description=vip");
    expect(report).toBe("id\n1");
  });

  it("compiles with every unused name reported", () => {
    const dir = writeProject(`styled-query/${label}`, generated(openApi(upstream.origin), options, "shop"));
    const strictest = { ...STRICT, noUnusedLocals: true, noUnusedParameters: true };

    expect(compileProject(dir, ["src/api/shop/index.ts"], strictest)).toEqual([]);
  }, 60_000);
});

describe("a Swagger 2.0 list in the query", () => {
  it("is joined with commas unless its collectionFormat says otherwise", async () => {
    const { petsApi } = loadGenerated(generated(swagger(upstream.origin), {}, "pets"), "src/api/pets/index.ts");
    upstream.requests.length = 0;

    await endpointAt(petsApi, "pets", "findPets")({ tags: ["a", "b"], status: ["x", "y"], owners: ["o1", "o2"] });

    expect(sent()).toEqual([
      ["GET", "/v2/pets", [["tags", "a,b"], ["status", "x"], ["status", "y"], ["owners", "o1|o2"]]],
    ]);
  });
});

describe("the parsed parameters", () => {
  it("keep a style only when it is not OpenAPI's default", () => {
    const listCustomers = openApi("http://127.0.0.1:1").groups[0]?.endpoints.find((ep) => ep.name === "listCustomers");

    expect(listCustomers?.parameters.map((param) => [param.name, param.encoding])).toEqual([
      ["created", { style: "deepObject", explode: true }],
      ["expand", { style: "deepObject", explode: true }],
      ["limit", undefined],
    ]);
  });
});
