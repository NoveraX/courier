/**
 * A response that is one of several shapes, compiled in every mode the
 * generator writes it.
 */
import { afterAll, describe, expect, it } from "vitest";

import type { GenerateOptions } from "../../../src/apis/generator";
import { generateCode } from "../../../src/apis/generator";
import { parseSpec } from "../../../src/apis/parser";
import { generatedProject } from "../../helpers/generated-project";

const project = generatedProject("courier-union-responses");

afterAll(() => {
  project.remove();
});

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const ok = (schema: unknown) => ({
  "200": { description: "ok", content: { "application/json": { schema } } },
});

/** Stripe's `Customer | DeletedCustomer`, and a list that may be null. */
const SPEC = JSON.stringify({
  openapi: "3.1.0",
  info: { title: "Unions", version: "1" },
  paths: {
    "/customers/{id}": {
      get: {
        tags: ["customers"],
        operationId: "getCustomer",
        responses: ok({ anyOf: [ref("Customer"), ref("DeletedCustomer")] }),
      },
    },
    "/customers": {
      get: {
        tags: ["customers"],
        operationId: "listCustomers",
        responses: ok({ type: ["array", "null"], items: ref("Customer") }),
      },
    },
  },
  components: {
    schemas: {
      Customer: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
      DeletedCustomer: {
        type: "object",
        required: ["id", "deleted"],
        properties: { id: { type: "string" }, deleted: { type: "boolean" } },
      },
    },
  },
});

function diagnostics(label: string, options: Partial<GenerateOptions>): string[] {
  const files = generateCode(
    parseSpec(SPEC),
    { type: "openapi", outputDir: "src", ...options },
    "unions",
  );
  return project.diagnostics(label, files);
}

interface Combination {
  validation: "zod" | "valibot" | "arktype" | "none";
  groupBy: "tag" | "single";
  generateTypes: boolean;
}

/* With neither a validator nor types there is no response type to write,
   so that combination has nothing of a union to get wrong. */
const COMBINATIONS: Combination[] = (["zod", "valibot", "arktype", "none"] as const)
  .flatMap((validation) =>
    (["tag", "single"] as const).flatMap((groupBy) =>
      [true, false].map((generateTypes) => ({ validation, groupBy, generateTypes })),
    ),
  )
  .filter(({ validation, generateTypes }) => validation !== "none" || generateTypes);

describe("a response that is one of several shapes", () => {
  it.each(COMBINATIONS)("compiles with %o", (options) => {
    const label = `${options.validation}-${options.groupBy}-${options.generateTypes}`;

    expect(diagnostics(label, options)).toEqual([]);
  });
});
