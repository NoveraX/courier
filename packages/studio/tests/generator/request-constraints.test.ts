/**
 * A specification's constraints, end to end: the schemas a request sends
 * check them, and the schemas an answer is read with do not. Generated for
 * each validation library and run by the library itself.
 */
import * as arktype from "arktype";
import ts from "typescript";
import * as valibot from "valibot";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as zod from "zod";

import { generateCode } from "../../src/apis/generator";
import { parseSpec } from "../../src/apis/parser";
import { endpointAt, generatedProject, loadGenerated } from "../helpers/generated-project";
import { type RecordingServer, startRecordingServer } from "../helpers/recording-server";

const LIBRARIES: Record<string, unknown> = { zod, valibot, arktype };
const VALIDATORS = ["zod", "valibot", "arktype"] as const;

const ref = (name: string): object => ({ $ref: `#/components/schemas/${name}` });
const json = (schema: object): object => ({ content: { "application/json": { schema } } });

const SPEC = {
  openapi: "3.0.3",
  info: { title: "Shop", version: "1" },
  servers: [{ url: "https://api.example.com" }],
  components: {
    schemas: {
      Sku: { type: "string", pattern: "^sku_[a-z0-9]+$", maxLength: 12 },
      Product: {
        type: "object",
        required: ["sku", "name", "price"],
        properties: {
          sku: ref("Sku"),
          name: { type: "string", minLength: 1, maxLength: 20 },
          price: { type: "integer", minimum: 0, exclusiveMaximum: 100000 },
          tags: { type: "array", items: { type: "string" }, maxItems: 3 },
        },
      },
      Review: {
        type: "object",
        required: ["stars"],
        properties: { stars: { type: "integer", minimum: 1, maximum: 5 } },
      },
      Range: { type: "object", properties: { gte: { type: "integer", minimum: 0 } } },
      Order: { type: "string", enum: ["asc", "desc"] },
    },
  },
  paths: {
    "/products": {
      post: {
        operationId: "createProduct",
        parameters: [
          { name: "dryRun", in: "query", schema: { type: "boolean" } },
          { name: "since", in: "query", schema: { anyOf: [{ type: "integer" }, ref("Range")] } },
        ],
        requestBody: json(ref("Product")),
        responses: { "201": { description: "ok", ...json(ref("Product")) } },
      },
      get: {
        operationId: "listProducts",
        parameters: [
          { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100 } },
          { name: "order", in: "query", schema: ref("Order") },
        ],
        responses: {
          "200": { description: "ok", ...json({ type: "array", items: ref("Product") }) },
        },
      },
    },
    "/reviews": {
      post: {
        operationId: "addReview",
        requestBody: json(ref("Review")),
        responses: { "204": { description: "done" } },
      },
    },
  },
};

interface StandardSchema {
  "~standard": { validate: (value: unknown) => { issues?: unknown } | Promise<unknown> };
}

function generated(validation: (typeof VALIDATORS)[number], baseURL = "https://api.example.com") {
  const spec = { ...SPEC, servers: [{ url: baseURL }] };
  return generateCode(parseSpec(JSON.stringify(spec)), {
    type: "openapi",
    sourceName: "shop",
    outputDir: "src",
    validation,
  });
}

const project = generatedProject("request-constraints");
let upstream: RecordingServer;

beforeAll(async () => {
  upstream = await startRecordingServer(() => ({ contentType: "application/json", body: "[]" }));
});

afterAll(async () => {
  await upstream.close();
  project.remove();
});

/** Transpile the schemas file and evaluate it with the real library. */
function schemasOf(files: ReturnType<typeof generateCode>): Record<string, StandardSchema> {
  const file = files.find((f) => f.path.endsWith("schemas.ts"));
  const { outputText } = ts.transpileModule(file?.content ?? "", {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const exports: Record<string, StandardSchema> = {};
  new Function("require", "exports", outputText)((id: string) => LIBRARIES[id], exports);
  return exports;
}

function accepts(schema: StandardSchema | undefined, value: unknown): boolean {
  if (!schema) throw new Error("schema was not generated");
  const result = schema["~standard"].validate(value);
  if (result instanceof Promise) throw new Error("expected a synchronous validator");
  return result.issues === undefined;
}

const VALID = { sku: "sku_a1", name: "Lamp", price: 4999, tags: ["home"] };
const INVALID = [
  { ...VALID, sku: "SKU-1" },
  { ...VALID, sku: "sku_abcdefghij" },
  { ...VALID, name: "" },
  { ...VALID, price: 49.99 },
  { ...VALID, price: -1 },
  { ...VALID, price: 100000 },
  { ...VALID, tags: ["a", "b", "c", "d"] },
];

describe.each(VALIDATORS)("%s", (validation) => {
  const files = generated(validation);
  const schemas = schemasOf(files);

  it("checks what a request sends against every constraint", () => {
    expect(accepts(schemas.ProductInputSchema, VALID)).toBe(true);
    expect(INVALID.map((product) => accepts(schemas.ProductInputSchema, product))).toEqual(
      INVALID.map(() => false),
    );
  });

  it("reads an answer as the API sends it, whatever its constraints say", () => {
    expect(INVALID.map((product) => accepts(schemas.ProductSchema, product))).toEqual(
      INVALID.map(() => true),
    );
  });

  it("checks a schema only requests send where it is", () => {
    expect(schemas.ReviewInputSchema).toBeUndefined();
    expect(accepts(schemas.ReviewSchema, { stars: 5 })).toBe(true);
    expect(accepts(schemas.ReviewSchema, { stars: 6 })).toBe(false);
  });

  it("compiles, a parameter's own schema naming another included", () => {
    expect(project.diagnostics(validation, files)).toEqual([]);
  });

  it("refuses a call whose parameter breaks a constraint, before anything is sent", async () => {
    const { shopApi } = loadGenerated(generated(validation, upstream.url), "src/shop/index.ts");
    const list = endpointAt(shopApi, "defaultGroup", "listProducts");
    upstream.requests.length = 0;

    await expect(list({ limit: 1000 })).rejects.toThrow();
    await expect(list({ order: "sideways" })).rejects.toThrow();
    await list({ limit: 10, order: "asc" });

    expect(upstream.requests.map((request) => request.query)).toEqual([
      [
        ["limit", "10"],
        ["order", "asc"],
      ],
    ]);
  });

  it("checks a parameter's value", () => {
    const code = files.map((file) => file.content).join("\n");
    const limit = { zod: ".min(1).max(100)", valibot: "v.minValue(1), v.maxValue(100)" };
    const expected = validation === "arktype" ? ".atLeast(1).atMost(100)" : limit[validation];

    expect(code).toContain(expected);
  });
});
