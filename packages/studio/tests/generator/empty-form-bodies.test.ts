/**
 * An operation whose form admits no field at all sends no body, and is
 * called without one. Stripe declares such a form on 298 operations, every
 * GET among them; it was generated as a `body` map each call had to pass,
 * and zod, valibot and ArkType refused a call that left it out.
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

const NOTHING = {
  required: false,
  content: {
    "application/x-www-form-urlencoded": {
      encoding: {},
      schema: { type: "object", properties: {}, additionalProperties: false },
    },
  },
};
const customer = { name: "customer", in: "path", required: true, schema: { type: "string" } };
const expand = {
  name: "expand",
  in: "query",
  style: "deepObject",
  explode: true,
  schema: { type: "array", items: { type: "string" } },
};
const Customer = { type: "object", properties: { id: { type: "string" } } };
const json = { "200": { description: "ok", content: { "application/json": { schema: Customer } } } };
const pdf = {
  "200": { description: "ok", content: { "application/pdf": { schema: { type: "string", format: "binary" } } } },
};

function spec(origin: string): ParsedSpec {
  const operation = (operationId: string, responses: unknown, parameters: unknown[] = [customer]) => ({
    operationId,
    tags: ["customers"],
    parameters,
    requestBody: NOTHING,
    responses,
  });
  return parseSpec(
    JSON.stringify({
      openapi: "3.0.0",
      info: { title: "Shop", version: "1" },
      servers: [{ url: `${origin}/` }],
      paths: {
        "/v1/customers/{customer}": {
          get: operation("GetCustomersCustomer", json, [customer, expand]),
          delete: operation("DeleteCustomersCustomer", json),
        },
        "/v1/customers/{customer}/statement": { get: operation("GetCustomersCustomerStatement", pdf) },
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
    { "/v1/customers/cus_1/statement": { contentType: "application/pdf", body: "%PDF-1.7" } },
  );
});

afterAll(async () => {
  await upstream.close();
  removeProjects("empty-form-bodies");
});

function generate(options: Partial<GenerateOptions>) {
  return generateCode(spec(upstream.origin), { type: "openapi", outputDir: "src/api", ...options }, "shop");
}

describe("the parsed operation", () => {
  it("has no body when its form admits no field", () => {
    const endpoints = spec("http://127.0.0.1:1").groups.flatMap((group) => group.endpoints);

    expect(endpoints.map((ep) => ep.requestBody)).toEqual([null, null, null]);
  });
});

describe.each(VARIANTS)("a generated client validated with %s", (label, options) => {
  it("is called without a body, and sends none", async () => {
    const { shopApi } = loadGenerated(generate(options), "src/api/shop/index.ts");
    upstream.requests.length = 0;

    const found = await endpointAt(shopApi, "customers", "getCustomersCustomer")({ customer: "cus_1", expand: ["tax"] });
    const removed = await endpointAt(shopApi, "customers", "deleteCustomersCustomer")({ customer: "cus_1" });
    const statement = await endpointAt(shopApi, "customers", "getCustomersCustomerStatement")({ customer: "cus_1" });

    expect([found, removed]).toEqual([{ id: "cus_1" }, { id: "cus_1" }]);
    expect(statement).toBeInstanceOf(Blob);
    expect(upstream.requests.map((request) => [request.method, request.path, request.body])).toEqual([
      ["GET", "/v1/customers/cus_1", ""],
      ["DELETE", "/v1/customers/cus_1", ""],
      ["GET", "/v1/customers/cus_1/statement", ""],
    ]);
  });

  it("compiles a call that passes no body", () => {
    const use = [
      'import { shopApi } from "./api/shop";',
      "export async function use(): Promise<Blob> {",
      '  await shopApi.customers.getCustomersCustomer({ customer: "cus_1" });',
      '  await shopApi.customers.deleteCustomersCustomer({ customer: "cus_1" });',
      '  return shopApi.customers.getCustomersCustomerStatement({ customer: "cus_1" });',
      "}",
      "",
    ].join("\n");
    const dir = writeProject(`empty-form-bodies/${label}`, generate(options), { "src/use.ts": use });

    expect(compileProject(dir, ["src/use.ts"], STRICT)).toEqual([]);
  }, 60_000);
});
