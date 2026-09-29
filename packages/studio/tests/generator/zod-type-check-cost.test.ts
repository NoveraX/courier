/**
 * How a generated zod schema is held to its declared type. Comparing each
 * schema with zod's whole `ZodType` made type-checking a large client cost
 * gigabytes — Stripe's took 3.7 GB and 15 seconds — so only what the schema
 * outputs is compared, which still refuses a schema and a type that disagree.
 */
import ts from "typescript";
import { afterAll, describe, expect, it } from "vitest";

import { generateCode } from "../../src/apis/generator";
import { parseSpec } from "../../src/apis/parser";
import { compileProject, removeProjects, STRICT, writeProject } from "../helpers/generated-project";

const SUITE = "zod-type-check-cost";

/* Forty schemas, each referring to the one before it, as a real API's do. */
function spec(): string {
  const schemas: Record<string, object> = {};
  for (let n = 0; n < 40; n += 1) {
    const properties: Record<string, object> = {
      id: { type: "string" },
      name: { type: "string" },
      count: { type: "integer" },
      tags: { type: "array", items: { type: "string" } },
      meta: { type: "object", properties: { note: { type: "string" } } },
    };
    if (n > 0) properties.previous = { $ref: `#/components/schemas/Thing${n - 1}` };
    schemas[`Thing${n}`] = { type: "object", required: ["id", "name"], properties };
  }
  return JSON.stringify({
    openapi: "3.0.3",
    info: { title: "Things", version: "1" },
    paths: {
      "/things": {
        get: {
          operationId: "listThings",
          responses: {
            "200": {
              description: "ok",
              content: { "application/json": { schema: { $ref: "#/components/schemas/Thing39" } } },
            },
          },
        },
      },
    },
    components: { schemas },
  });
}

function schemasFile(): string {
  const files = generateCode(
    parseSpec(spec()),
    { type: "openapi", outputDir: "src/api" },
    "things",
  );
  return files.find((file) => file.path.endsWith("schemas.ts"))?.content ?? "";
}

/* How many type instantiations checking the schemas file takes. */
function instantiations(label: string, schemas: string): number {
  const dir = writeProject(`${SUITE}/${label}`, [{ path: "schemas.ts", content: schemas }]);
  const program = ts.createProgram([`${dir}/schemas.ts`], STRICT);
  expect(ts.getPreEmitDiagnostics(program)).toEqual([]);
  const checker = program.getTypeChecker() as ts.TypeChecker & { getInstantiationCount(): number };
  return checker.getInstantiationCount();
}

afterAll(() => {
  removeProjects(SUITE);
});

describe("a generated zod schema", () => {
  it("is held to its type by what it outputs", () => {
    const schemas = schemasFile();

    expect(schemas).toContain("satisfies { _zod: { output: Thing0 } }");
    expect(schemas).not.toContain("satisfies z.ZodType<");
  });

  it("is still refused where it outputs something other than its type", () => {
    const drifted = schemasFile().replace(
      "count: z.number().optional(),",
      "count: z.string().optional(),",
    );
    const dir = writeProject(`${SUITE}/drifted`, [{ path: "schemas.ts", content: drifted }]);

    expect(compileProject(dir, ["schemas.ts"]).join("\n")).toMatch(
      /Type 'string' is not assignable to type 'number'/,
    );
  });

  it("costs the compiler a fraction of what comparing the whole ZodType did", () => {
    const schemas = schemasFile();
    const whole = schemas.replace(
      /satisfies \{ _zod: \{ output: (\w+) \} \}/g,
      "satisfies z.ZodType<$1>",
    );

    expect(instantiations("output", schemas) * 2).toBeLessThan(instantiations("whole", whole));
  });
});
