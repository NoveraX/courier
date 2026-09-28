/**
 * Each variable of a generated endpoint reaches the place the specification
 * puts it: a query parameter of a write goes in the query string, beside
 * the body, and a DELETE's body is sent as a body — whichever validator the
 * client was generated with, directly and through the proxy.
 */
import { createProxyCaller } from "@noverax/courier";
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
import { type ProxyServer, startProxyServer } from "../helpers/proxy-server";
import { type UpstreamServer, startUpstreamServer } from "../helpers/upstream-server";

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const json = (schema: unknown) => ({ content: { "application/json": { schema } } });
const ok = { "200": { description: "ok", ...json(ref("Item")) } };
const query = (name: string, required = false) => ({
  name,
  in: "query",
  required,
  schema: { type: "string" },
});
const itemId = { name: "item_id", in: "path", required: true, schema: { type: "integer" } };

function spec(origin: string): ParsedSpec {
  return parseSpec(
    JSON.stringify({
      openapi: "3.0.3",
      info: { title: "Shop", version: "1" },
      servers: [{ url: `${origin}/v1` }],
      paths: {
        "/items/{item_id}": {
          put: {
            operationId: "replaceItem",
            tags: ["items"],
            parameters: [itemId, query("dryRun"), query("fieldManager", true)],
            requestBody: json(ref("Item")),
            responses: ok,
          },
          delete: {
            operationId: "deleteItem",
            tags: ["items"],
            parameters: [itemId],
            requestBody: json(ref("DeleteReason")),
            responses: ok,
          },
        },
        "/items": {
          post: {
            operationId: "createItem",
            tags: ["items"],
            parameters: [query("dryRun")],
            requestBody: json(ref("Item")),
            responses: ok,
          },
        },
        "/items/{item_id}/rename": {
          post: {
            operationId: "renameItem",
            tags: ["items"],
            parameters: [itemId, query("name", true), query("class")],
            responses: ok,
          },
        },
        "/items/{item_id}/notes": {
          patch: {
            operationId: "noteItem",
            tags: ["items"],
            parameters: [itemId, query("body")],
            requestBody: json({ type: "object", properties: { note: { type: "string" } } }),
            responses: ok,
          },
        },
      },
      components: {
        schemas: {
          Item: { type: "object", required: ["name"], properties: { name: { type: "string" } } },
          DeleteReason: {
            type: "object",
            required: ["message", "sha"],
            properties: { message: { type: "string" }, sha: { type: "string" } },
          },
        },
      },
    }),
  );
}

const CALLS: [string, unknown, string][] = [
  [
    "replaceItem",
    { item_id: 7, name: "thing", dryRun: "All", fieldManager: "kubectl" },
    'PUT /v1/items/7?dryRun=All&fieldManager=kubectl {"name":"thing"}',
  ],
  ["createItem", { name: "thing", dryRun: "All" }, 'POST /v1/items?dryRun=All {"name":"thing"}'],
  ["deleteItem", { item_id: 7, message: "bye", sha: "abc" }, 'DELETE /v1/items/7 {"message":"bye","sha":"abc"}'],
  ["renameItem", { item_id: 7, name: "new", class: "a" }, "POST /v1/items/7/rename?name=new&class=a "],
  ["noteItem", { item_id: 7, note: "n", body: "b" }, 'PATCH /v1/items/7/notes?body=b {"note":"n"}'],
];

const VARIANTS: [string, Partial<GenerateOptions>][] = [
  ["zod", {}],
  ["valibot", { validation: "valibot" }],
  ["arktype", { validation: "arktype" }],
  ["none", { validation: "none" }],
  ["types-only", { generateSchemas: false }],
];

let upstream: UpstreamServer;

beforeAll(async () => {
  upstream = await startUpstreamServer({ name: "thing" });
});

afterAll(async () => {
  await upstream.close();
  removeProjects("wire-closure");
});

function generate(options: Partial<GenerateOptions>) {
  return generateCode(spec(upstream.origin), { type: "openapi", outputDir: "src/api", ...options }, "shop");
}

function sent(): string[] {
  return upstream.requests.map((r) => {
    const query = r.query.map(([key, value]) => `${key}=${value}`).join("&");
    return `${r.method} ${r.path}${query ? `?${query}` : ""} ${r.body}`;
  });
}

describe.each(VARIANTS)("a generated client validated with %s", (label, options) => {
  it.each(CALLS)("sends %s's variables where the specification puts them", async (name, variables, request) => {
    const { shopApi } = loadGenerated(generate(options), "src/api/shop/index.ts");
    upstream.requests.length = 0;

    await endpointAt(shopApi, "items", name)(variables);

    expect(sent()).toEqual([request]);
  });

  it("compiles with every unused name reported", () => {
    const dir = writeProject(`wire-closure/${label}`, generate(options));
    const strictest = { ...STRICT, noUnusedLocals: true, noUnusedParameters: true };

    expect(compileProject(dir, ["src/api/shop/index.ts"], strictest)).toEqual([]);
  }, 60_000);
});

describe("through the proxy", () => {
  let proxy: ProxyServer;

  beforeAll(async () => {
    proxy = await startProxyServer(loadGenerated(generate({}), "src/api/shop/source.ts"));
  });

  afterAll(async () => {
    await proxy.close();
  });

  it.each(CALLS)("sends %s's variables where the specification puts them", async (name, variables, request) => {
    const caller = createProxyCaller("shop", { proxyPath: { http: proxy.url } });
    upstream.requests.length = 0;

    await endpointAt(caller, "items", name)(variables);

    expect(sent()).toEqual([request]);
  });
});
