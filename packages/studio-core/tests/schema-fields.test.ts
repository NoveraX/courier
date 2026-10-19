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

/* An object checked through a generated `_ownFields`, as Studio's generator writes it for a field
   named like a member every object inherits: its fields kept as `fields`, zod's `__proto__` as `proto`. */
const zodFields = z.looseObject({ id: z.string(), constructor: z.string().optional() });
const ZOD_OWN = Object.assign(
  z.preprocess((value) => value, zodFields),
  { fields: zodFields, proto: z.number().optional() },
);
const valibotFields = v.looseObject({ id: v.string(), constructor: v.optional(v.string()) });
const VALIBOT_OWN = Object.assign(
  v.pipe(
    v.unknown(),
    v.transform((value) => value),
  ),
  { fields: valibotFields },
);
const ARK_OWN = Object.assign(
  type("object").narrow(() => true),
  { fields: type({ id: "string", "constructor?": "string" }) },
);
const OWN = [
  { path: "id", type: "string", required: true },
  { path: "constructor", type: "string", required: false },
];

describe("the fields of a variables schema", () => {
  it("are read through a generated _ownFields, inside another object too", () => {
    const byPath = (a: { path: string }, b: { path: string }) => a.path.localeCompare(b.path);

    expect(extractSchemaFields(ZOD_OWN)).toEqual([
      ...OWN,
      { path: "__proto__", type: "number", required: false },
    ]);
    expect(extractSchemaFields(z.object({ thing: ZOD_OWN }))?.map((field) => field.path)).toEqual([
      "thing",
      "thing.id",
      "thing.constructor",
      "thing.__proto__",
    ]);
    expect(extractSchemaFields(VALIBOT_OWN)).toEqual(OWN);
    expect(extractSchemaFields(v.object({ thing: VALIBOT_OWN }))?.length).toBe(3);
    expect(extractSchemaFields(ARK_OWN)?.toSorted(byPath)).toEqual(OWN.toSorted(byPath));
  });

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

  it("are read from an ArkType schema with a Date or a narrow, which its JSON Schema cannot hold", () => {
    const schema = type({ at: "Date", sku: "string" }).narrow((value) => value.sku !== "");

    expect(extractSchemaFields(schema)).toEqual([
      { path: "at", type: "unknown", required: true },
      { path: "sku", type: "string", required: true },
    ]);
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

  it("say a numeric TypeScript enum's numbers, not the names it maps them back to", () => {
    const level = { Low: 0, High: 1, 0: "Low", 1: "High" } as const;

    expect(extractSchemaFields(z.object({ level: z.enum(level) }))?.[0]?.type).toBe("0 | 1");
    expect(extractSchemaFields(z3.object({ level: z3.nativeEnum(level) }))?.[0]?.type).toBe(
      "0 | 1",
    );
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
