import { describe, expect, it } from "vitest";

import { parseSpec } from "../src/apis/parser";
import { generateCode, applyImportDefaults } from "../src/apis/generator";
import { findCyclicSchemas } from "../src/apis/generator/cyclic-schemas";
import type { ParsedSchema } from "../src/apis/parser/types";

function object(properties: Record<string, { refName?: string; type?: string }>): ParsedSchema {
  return {
    name: "X",
    type: "object",
    properties: Object.fromEntries(
      Object.entries(properties).map(([key, value]) => [
        key,
        { type: value.type ?? "object", required: false, refName: value.refName },
      ]),
    ),
  } as ParsedSchema;
}

function schemasFor(components: Record<string, unknown>): string {
  const files = generateCode(
    parseSpec(
      JSON.stringify({
        openapi: "3.0.0",
        info: { title: "Cycles", version: "1.0.0" },
        paths: {
          "/things": {
            get: {
              operationId: "list",
              responses: {
                "200": {
                  description: "ok",
                  content: {
                    "application/json": { schema: { $ref: "#/components/schemas/Customer" } },
                  },
                },
              },
            },
          },
        },
        components: { schemas: components },
      }),
    ),
    applyImportDefaults({ type: "openapi", sourceName: "api", outputDir: "src/api" }),
  );
  return files.find((f) => f.path.endsWith("schemas.ts"))?.content ?? "";
}

const CUSTOMER_AND_ACCOUNT = {
  Customer: {
    type: "object",
    properties: { account: { $ref: "#/components/schemas/BankAccount" } },
  },
  BankAccount: {
    type: "object",
    properties: { customer: { $ref: "#/components/schemas/Customer" } },
  },
};

describe("findCyclicSchemas", () => {
  it("finds a schema that refers to itself", () => {
    expect([...findCyclicSchemas({ Node: object({ parent: { refName: "Node" } }) })]).toEqual([
      "Node",
    ]);
  });

  it("finds both halves of a mutual reference", () => {
    const found = findCyclicSchemas({
      Customer: object({ account: { refName: "BankAccount" } }),
      BankAccount: object({ customer: { refName: "Customer" } }),
    });

    expect(found).toEqual(new Set(["Customer", "BankAccount"]));
  });

  it("leaves an ordinary chain alone", () => {
    const found = findCyclicSchemas({
      Order: object({ customer: { refName: "Customer" } }),
      Customer: object({ name: { type: "string" } }),
    });

    expect(found.size).toBe(0);
  });
});

describe("a schema on a reference cycle", () => {
  it("is declared lazily so nothing is read before it exists", () => {
    const out = schemasFor(CUSTOMER_AND_ACCOUNT);

    expect(out).toContain("z.lazy(");
    expect(out).toMatch(/export const CustomerSchema: z\.ZodType<Customer> = z\.lazy/);
  });

  it("still declares a schema that is not on the cycle eagerly", () => {
    const out = schemasFor({
      Customer: {
        type: "object",
        properties: {
          account: { $ref: "#/components/schemas/BankAccount" },
          address: { $ref: "#/components/schemas/Plain" },
        },
      },
      BankAccount: {
        type: "object",
        properties: { customer: { $ref: "#/components/schemas/Customer" } },
      },
      Plain: { type: "object", properties: { city: { type: "string" } } },
    });

    expect(out).toMatch(/export const PlainSchema = z\.object/);
    expect(out).toMatch(/export const CustomerSchema: z\.ZodType<Customer> = z\.lazy/);
  });

  it("would otherwise be read before its declaration", () => {
    /* Two constants that name each other cannot both come first; the eager
       form throws on import rather than merely failing to compile. */
    expect(() => {
      new Function("const A = { b: B }; const B = { a: A }; return A;")();
    }).toThrow(ReferenceError);
  });
});
