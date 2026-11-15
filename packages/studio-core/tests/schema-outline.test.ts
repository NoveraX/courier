/**
 * What an endpoint's variables schema takes, read from Zod v4 and v3,
 * Valibot and ArkType for the Playground to check variables against: the
 * type of each value, an enum's values, the fields an object is refused
 * without, an array's items and a union's forms — and nothing said of a
 * part that converts or replaces what it is given, or of one JSON has no
 * type for, so that no value the schema takes is refused by the check.
 */
import { type } from "arktype";
import * as v from "valibot";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { z as z3 } from "zod/v3";

import { extractSchemaOutline, type OutlineField, type SchemaOutline } from "../src/schema-fields";

const STRING = { type: "string" } as const;
const NUMBER = { type: "number" } as const;
const NULL = { type: "null" } as const;

const ORDER: SchemaOutline = {
  type: "object",
  fields: [
    {
      name: "items",
      required: true,
      outline: {
        type: "array",
        items: {
          type: "object",
          fields: [
            { name: "sku", required: true, outline: STRING },
            { name: "qty", required: true, outline: NUMBER },
          ],
        },
      },
    },
    { name: "currency", required: true, outline: { type: "enum", values: ["EUR", "USD"] } },
    {
      name: "shipping",
      required: false,
      outline: { type: "object", fields: [{ name: "method", required: true, outline: STRING }] },
    },
    { name: "note", required: false, outline: { type: "union", options: [STRING, NULL] } },
  ],
};

/* The outline with each object's fields in the order of their names, for a vendor that keeps its own. */
function byName(outline: SchemaOutline): SchemaOutline {
  if (outline.type === "array")
    return outline.items ? { ...outline, items: byName(outline.items) } : outline;
  if (outline.type !== "object" || !outline.fields) return outline;
  const fields = outline.fields
    .map((field) => (field.outline ? { ...field, outline: byName(field.outline) } : field))
    .toSorted((a, b) => a.name.localeCompare(b.name));
  return { ...outline, fields };
}

function fieldOf(outline: SchemaOutline | undefined, name: string): OutlineField | undefined {
  return outline?.type === "object"
    ? outline.fields?.find((field) => field.name === name)
    : undefined;
}

describe("the outline of a variables schema", () => {
  it("is read from Zod v4, a defaulted field not required", () => {
    const schema = z.object({
      items: z.array(z.object({ sku: z.string(), qty: z.number().int() })),
      currency: z.enum(["EUR", "USD"]),
      shipping: z.object({ method: z.string() }).optional(),
      note: z.string().nullable().default(null),
    });

    expect(extractSchemaOutline(schema)).toEqual(ORDER);
  });

  it("is read from Zod v3", () => {
    const schema = z3.object({
      items: z3.array(z3.object({ sku: z3.string(), qty: z3.number() })),
      currency: z3.enum(["EUR", "USD"]),
      shipping: z3.object({ method: z3.string() }).optional(),
      note: z3.string().nullable().optional(),
    });

    expect(extractSchemaOutline(schema)).toEqual(ORDER);
  });

  it("is read from Valibot", () => {
    const schema = v.object({
      items: v.array(v.object({ sku: v.string(), qty: v.number() })),
      currency: v.picklist(["EUR", "USD"]),
      shipping: v.optional(v.object({ method: v.string() })),
      note: v.nullish(v.string()),
    });

    expect(extractSchemaOutline(schema)).toEqual(ORDER);
  });

  it("is read from ArkType through its JSON Schema", () => {
    const schema = type({
      items: type({ sku: "string", qty: "number" }).array(),
      currency: "'EUR' | 'USD'",
      "shipping?": { method: "string" },
      "note?": "string | null",
    });

    const outline = extractSchemaOutline(schema);

    expect(outline && byName(outline)).toEqual(byName(ORDER));
  });

  it("takes any value, left out too, for a part that converts or replaces what it is given", () => {
    const id = { type: "object", fields: [{ name: "id", required: true, outline: STRING }] };
    const toText = (value: unknown) => String(value);

    expect(
      extractSchemaOutline(
        z.object({
          id: z.string(),
          count: z.coerce.number(),
          level: z.number().catch(0),
          tag: z.preprocess(toText, z.string()),
        }),
      ),
    ).toEqual(id);
    expect(
      extractSchemaOutline(
        z3.object({
          id: z3.string(),
          size: z3.coerce.number(),
          kind: z3.string().catch("a"),
          label: z3.preprocess(toText, z3.string()),
        }),
      ),
    ).toEqual(id);
    expect(
      extractSchemaOutline(v.object({ id: v.string(), every: v.fallback(v.number(), 5) })),
    ).toEqual(id);
  });

  it("asks for a field of a type JSON has none for, and tells nothing of its value", () => {
    const schema = z.object({ at: z.date(), id: z.bigint(), any: z.unknown(), file: z.custom() });

    expect(extractSchemaOutline(schema)).toEqual({
      type: "object",
      fields: [
        { name: "at", required: true },
        { name: "id", required: true },
      ],
    });
  });

  it("lets a field whose literal may be undefined be left out, and lists each value once", () => {
    const outline = extractSchemaOutline(
      z.object({
        mode: z.literal(["fast", undefined]),
        speed: z.enum({ fast: "fast", quick: "fast" }),
      }),
    );

    expect(fieldOf(outline, "mode")).toEqual({
      name: "mode",
      required: false,
      outline: { type: "enum", values: ["fast"] },
    });
    expect(fieldOf(outline, "speed")?.outline).toEqual({ type: "enum", values: ["fast"] });
  });

  it("holds a union's forms once each, its literals as one enum, and null where it may be", () => {
    const schema = z.object({
      id: z.union([z.string(), z.number(), z.union([z.string(), z.null()])]),
      kind: z.union([z.literal("a"), z.literal("b")]).nullable(),
      pick: z.union([z.string(), z.date()]),
    });
    const outline = extractSchemaOutline(schema);

    expect(fieldOf(outline, "id")?.outline).toEqual({
      type: "union",
      options: [STRING, NUMBER, NULL],
    });
    expect(fieldOf(outline, "kind")?.outline).toEqual({
      type: "union",
      options: [{ type: "enum", values: ["a", "b"] }, NULL],
    });
    expect(fieldOf(outline, "pick")).toEqual({ name: "pick", required: true });
  });

  it("reads a discriminated union and a record, and an object at its root", () => {
    const payment = z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("card"), number: z.string() }),
      z.object({ kind: z.literal("bank"), iban: z.string() }),
    ]);

    expect(
      extractSchemaOutline(z.object({ payment, meta: z.record(z.string(), z.number()) })),
    ).toEqual({
      type: "object",
      fields: [
        {
          name: "payment",
          required: true,
          outline: {
            type: "union",
            options: [
              {
                type: "object",
                fields: [
                  { name: "kind", required: true, outline: { type: "enum", values: ["card"] } },
                  { name: "number", required: true, outline: STRING },
                ],
              },
              {
                type: "object",
                fields: [
                  { name: "kind", required: true, outline: { type: "enum", values: ["bank"] } },
                  { name: "iban", required: true, outline: STRING },
                ],
              },
            ],
          },
        },
        { name: "meta", required: true, outline: { type: "object" } },
      ],
    });
  });

  it("holds the types of an enum's values past the most it lists", () => {
    const codes = Array.from({ length: 40 }, (_, at) => `C${at}`);

    expect(
      fieldOf(extractSchemaOutline(z.object({ code: z.enum(codes) })), "code")?.outline,
    ).toEqual(STRING);
  });

  it("tells nothing of the items of a tuple its JSON Schema lists by place", () => {
    const outline = extractSchemaOutline(
      type({ pair: ["string", "number"], rest: ["string", "...", "number[]"] }),
    );

    expect(fieldOf(outline, "pair")?.outline).toEqual({ type: "array" });
    expect(fieldOf(outline, "rest")?.outline).toEqual({ type: "array" });
  });

  it("stops where a schema holds itself", () => {
    interface Category {
      name: string;
      children: Category[];
    }
    const category: z.ZodType<Category> = z.object({
      name: z.string(),
      children: z.array(z.lazy(() => category)),
    });
    const outline = extractSchemaOutline(category);
    const children = fieldOf(outline, "children")?.outline;

    expect(fieldOf(outline, "name")?.outline).toEqual(STRING);
    expect(children?.type === "array" && fieldOf(children.items, "name")?.outline).toEqual(STRING);
    expect(JSON.stringify(outline).length).toBeLessThan(2_000);
  });

  it("is read through a generated _ownFields", () => {
    const fields = z.looseObject({ id: z.string(), constructor: z.string().optional() });
    const own = Object.assign(
      z.preprocess((value) => value, fields),
      { fields, proto: undefined },
    );

    expect(extractSchemaOutline(own)).toEqual({
      type: "object",
      fields: [
        { name: "id", required: true, outline: STRING },
        { name: "constructor", required: false, outline: STRING },
      ],
    });
  });

  it("is unknown for a schema it cannot read, or one whose reading throws", () => {
    const later = z.object({
      later: z.lazy(() => {
        throw new Error("not ready");
      }),
    });

    expect(extractSchemaOutline({ not: "a schema" })).toBeUndefined();
    expect(extractSchemaOutline(z.unknown())).toBeUndefined();
    expect(extractSchemaOutline(later)).toBeUndefined();
  });
});
