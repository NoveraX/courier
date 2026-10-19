/**
 * A composition found inside itself is generated as a schema of its own,
 * which refers to itself: the client compiles under the strictest options
 * with every validator, and each validator checks the composition at every
 * level — a category's parent's parent without its depth is refused.
 */
import { afterAll, describe, expect, it } from "vitest";

import type { GenerateOptions } from "../../src/apis/generator";
import { generateCode } from "../../src/apis/generator";
import { parseSpec } from "../../src/apis/parser";
import {
  compileProject,
  loadGenerated,
  removeProjects,
  STRICT,
  writeProject,
} from "../helpers/generated-project";

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const id = { name: "id", in: "path", required: true, schema: { type: "string" } };
const category = { "application/json": { schema: ref("Category") } };

const SPEC = JSON.stringify({
  openapi: "3.0.3",
  info: { title: "Shop", version: "1" },
  servers: [{ url: "https://shop.test" }],
  paths: {
    "/categories/{id}": {
      get: {
        operationId: "getCategory",
        tags: ["categories"],
        parameters: [id],
        responses: { 200: { description: "ok", content: category } },
      },
      put: {
        operationId: "putCategory",
        tags: ["categories"],
        parameters: [id],
        requestBody: { required: true, content: category },
        responses: { 200: { description: "ok", content: category } },
      },
    },
  },
  components: {
    schemas: {
      Category: {
        type: "object",
        required: ["id"],
        properties: {
          id: { type: "string" },
          parent: {
            allOf: [
              ref("Category"),
              { type: "object", required: ["depth"], properties: { depth: { type: "integer" } } },
            ],
          },
        },
      },
    },
  },
});

const VALIDATORS: Array<[string, Partial<GenerateOptions>]> = [
  ["zod", {}],
  ["valibot", { validation: "valibot" }],
  ["arktype", { validation: "arktype" }],
  ["none", { validation: "none" }],
];

interface StandardSchema {
  "~standard": { validate: (value: unknown) => { issues?: unknown } | Promise<unknown> };
}

function isStandardSchema(value: unknown): value is StandardSchema {
  return (
    (typeof value === "object" || typeof value === "function") &&
    value !== null &&
    "~standard" in value
  );
}

function accepts(schema: unknown, value: unknown): boolean {
  if (!isStandardSchema(schema)) throw new Error("no schema was generated");
  const result = schema["~standard"].validate(value);
  if (result instanceof Promise) throw new Error("the validator answered asynchronously");
  return result.issues === undefined;
}

afterAll(() => removeProjects("recursive-compositions"));

function generated(options: Partial<GenerateOptions>) {
  return generateCode(
    parseSpec(SPEC),
    { type: "openapi", outputDir: "src/api", ...options },
    "shop",
  );
}

describe.each(VALIDATORS)("a composition inside itself, validated with %s", (label, options) => {
  it("compiles under the strictest options", () => {
    const dir = writeProject(`recursive-compositions/${label}`, generated(options));

    expect(
      compileProject(dir, ["src/api/shop/index.ts"], {
        ...STRICT,
        exactOptionalPropertyTypes: true,
        noUnusedLocals: true,
        noUnusedParameters: true,
      }),
    ).toEqual([]);
  });
});

describe.each(VALIDATORS.filter(([label]) => label !== "none"))(
  "a composition inside itself, checked by %s",
  (_, options) => {
    it("refuses a parent's parent without its depth", () => {
      const { CategorySchema } = loadGenerated(
        generated(options),
        "src/api/shop/categories/schemas.ts",
      );
      const deep = (depth?: number) => ({
        id: "a",
        parent: { id: "b", depth: 1, parent: { id: "c", ...(depth !== undefined && { depth }) } },
      });

      expect(accepts(CategorySchema, deep(2))).toBe(true);
      expect(accepts(CategorySchema, deep())).toBe(false);
    });
  },
);
