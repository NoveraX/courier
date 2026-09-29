/**
 * A schema that refers to itself through a union — any JSON value, say —
 * accepts every value its alternatives allow when ArkType validates it,
 * booleans included, however deep they sit.
 */
import { describe, expect, it } from "vitest";

import { generateCode } from "../../src/apis/generator";
import { parseSpec } from "../../src/apis/parser";
import { loadGenerated } from "../helpers/generated-project";

const json = { $ref: "#/components/schemas/Json" };

const SPEC = parseSpec(
  JSON.stringify({
    openapi: "3.0.3",
    info: { title: "Cycles", version: "1" },
    paths: {
      "/value": {
        get: {
          operationId: "getValue",
          tags: ["values"],
          responses: {
            "200": { description: "ok", content: { "application/json": { schema: json } } },
          },
        },
      },
    },
    components: {
      schemas: {
        Json: {
          oneOf: [
            { type: "string" },
            { type: "number" },
            { type: "boolean" },
            { type: "array", items: json },
            { type: "object", additionalProperties: json },
          ],
        },
      },
    },
  }),
);

interface StandardSchema {
  "~standard": { validate: (value: unknown) => { issues?: unknown[] } | Promise<unknown> };
}

function isStandardSchema(value: unknown): value is StandardSchema {
  return (
    typeof value === "function" ||
    (typeof value === "object" && value !== null && "~standard" in value)
  );
}

function accepts(value: unknown): boolean {
  const files = generateCode(
    SPEC,
    { type: "openapi", outputDir: "src", validation: "arktype" },
    "cycles",
  );
  const schema = loadGenerated(files, "src/cycles/values/schemas.ts").JsonSchema;
  if (!isStandardSchema(schema)) throw new Error("JsonSchema is not a schema");
  const result = schema["~standard"].validate(value);
  if (result instanceof Promise) throw new Error("expected a synchronous validator");
  return result.issues === undefined;
}

describe("a JSON value on a cycle, validated with ArkType", () => {
  it.each([
    ["a boolean inside a list", [true]],
    ["a boolean deep inside", { a: [1, "x", { b: [false, { c: "d" }] }] }],
    ["a list of lists", [[true], ["s"]]],
  ])("accepts %s", (_label, value) => {
    expect(accepts(value)).toBe(true);
  });

  it("still refuses what is not JSON", () => {
    expect(accepts([1n])).toBe(false);
  });
});
