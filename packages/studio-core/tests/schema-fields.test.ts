/**
 * The fields an endpoint's variables schema declares, read from Zod v4 and
 * v3, Valibot and ArkType: where each sits, its type and whether it is
 * required, nested objects and arrays of objects included.
 */
import { type } from "arktype";
import * as v from "valibot";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { z as z3 } from "zod/v3";

import { extractSchemaFields } from "../src/schema-fields";

const ORDER = [
  { path: "items", type: "object[]", required: true },
  { path: "items[].sku", type: "string", required: true },
  { path: "items[].qty", type: "number", required: true },
  { path: "currency", type: '"EUR" | "USD"', required: true },
  { path: "shipping", type: "object", required: false },
  { path: "shipping.method", type: "string", required: true },
  { path: "note", type: "string | null", required: false },
];

describe("the fields of a variables schema", () => {
  it("are read from Zod v4, optional and defaulted fields not required", () => {
    const schema = z.object({
      items: z.array(z.object({ sku: z.string(), qty: z.number().int() })),
      currency: z.enum(["EUR", "USD"]),
      shipping: z.object({ method: z.string() }).optional(),
      note: z.string().nullable().default(null),
    });

    expect(extractSchemaFields(schema)).toEqual(ORDER);
  });

  it("are read from Zod v3", () => {
    const schema = z3.object({
      items: z3.array(z3.object({ sku: z3.string(), qty: z3.number() })),
      currency: z3.enum(["EUR", "USD"]),
      shipping: z3.object({ method: z3.string() }).optional(),
      note: z3.string().nullable().optional(),
    });

    expect(extractSchemaFields(schema)).toEqual(ORDER);
  });

  it("are read from Valibot", () => {
    const schema = v.object({
      items: v.array(v.object({ sku: v.string(), qty: v.number() })),
      currency: v.picklist(["EUR", "USD"]),
      shipping: v.optional(v.object({ method: v.string() })),
      note: v.nullish(v.string()),
    });

    expect(extractSchemaFields(schema)).toEqual(ORDER);
  });

  it("are read from ArkType through its JSON Schema, in the order ArkType keeps", () => {
    const schema = type({
      items: type({ sku: "string", qty: "number" }).array(),
      currency: "'EUR' | 'USD'",
      "shipping?": { method: "string" },
      "note?": "string | null",
    });
    const byPath = (a: { path: string }, b: { path: string }) => a.path.localeCompare(b.path);

    expect(extractSchemaFields(schema)?.toSorted(byPath)).toEqual(ORDER.toSorted(byPath));
  });

  it("say what a literal, a union and an array of scalars hold", () => {
    const schema = z.object({
      kind: z.literal("order"),
      id: z.union([z.string(), z.number()]),
      tags: z.array(z.string()),
      either: z.array(z.union([z.string(), z.number()])),
    });

    expect(extractSchemaFields(schema)?.map((f) => f.type)).toEqual([
      '"order"',
      "string | number",
      "string[]",
      "(string | number)[]",
    ]);
  });

  it("are none for an object without fields, and unknown for a schema that is no object", () => {
    expect(extractSchemaFields(z.object({}))).toEqual([]);
    expect(extractSchemaFields(z.string())).toBeUndefined();
    expect(extractSchemaFields({ not: "a schema" })).toBeUndefined();
  });

  it("stop three levels down", () => {
    const schema = z.object({ a: z.object({ b: z.object({ c: z.object({ d: z.string() }) }) }) });

    expect(extractSchemaFields(schema)?.map((f) => f.path)).toEqual(["a", "a.b", "a.b.c"]);
  });

  it("are unknown when reading the schema throws", () => {
    const schema = z.object({
      later: z.lazy(() => {
        throw new Error("not ready");
      }),
    });

    expect(extractSchemaFields(schema)).toBeUndefined();
  });
});
