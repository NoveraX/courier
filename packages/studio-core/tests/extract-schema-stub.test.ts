/**
 * The sample variables the Playground starts a call with pass the schema: a
 * number at least its lower bound, a string at least its minimum length, an
 * enum's first value, a known format's sample, a nested object filled in —
 * so `z.number().min(100)` starts at 100 and an optional `z.enum()` at its
 * first value, not at a `0` or a `""` the first send would have refused. A
 * field whose check cannot be read is left out when it may be.
 */
import { type } from "arktype";
import * as v from "valibot";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { z as z3 } from "zod/v3";

import { extractSchemaStub } from "../src/schema-fields";

/* A numeric TypeScript enum as the compiler emits it, each number mapped back to its name. */
const LEVEL = { Low: 0, High: 1, 0: "Low", 1: "High" } as const;

describe("the sample variables of a schema", () => {
  it("are read through a generated _ownFields, and pass it", () => {
    /* As Studio's generator writes an object with a field named like a member every object has. */
    const fields = z.looseObject({ id: z.string().min(2), constructor: z.string().optional() });
    const schema = Object.assign(
      z.preprocess((value) => value, fields),
      {
        fields,
        proto: undefined,
      },
    );

    const stub = extractSchemaStub(schema);

    expect(stub).toMatchObject({ id: "xx" });
    expect(schema.safeParse(stub).success).toBe(true);
  });

  it("keep a Zod schema's lower bounds, and pass it", () => {
    const schema = z.object({
      every: z.number().int().min(100),
      count: z.number().positive(),
      code: z.string().min(3),
      label: z.string(),
      done: z.boolean().optional(),
    });

    const stub = extractSchemaStub(schema);

    expect(stub).toEqual({ every: 100, count: 1, code: "xxx", label: "", done: false });
    expect(schema.safeParse(stub).success).toBe(true);
  });

  it("give a Zod field of every kind it reads a value the field takes", () => {
    const schema = z.object({
      category: z.enum(["audio", "desk"]).optional(),
      kind: z.literal("order"),
      id: z.union([z.number().int().positive(), z.uuid()]),
      either: z.union([z.string().regex(/^[a-z]+$/), z.number()]),
      tags: z.array(z.string().min(2)).min(2),
      shipping: z.object({ method: z.enum(["post", "courier"]), note: z.string().optional() }),
      contact: z.email(),
      site: z.url().optional(),
      at: z.iso.datetime(),
      day: z.iso.date().optional(),
      ref: z.string().uuid(),
      host: z.ipv4(),
      below: z.number().negative(),
      step: z.number().gte(3).multipleOf(5),
      note: z.string().nullable(),
      level: z.enum(LEVEL),
    });

    const stub = extractSchemaStub(schema);

    expect(stub).toEqual({
      category: "audio",
      kind: "order",
      id: 1,
      either: 0,
      tags: ["xx", "xx"],
      shipping: { method: "post", note: "" },
      contact: "name@example.com",
      site: "https://example.com",
      at: "2026-01-01T00:00:00Z",
      day: "2026-01-01",
      ref: "00000000-0000-4000-8000-000000000000",
      host: "127.0.0.1",
      below: -1,
      step: 5,
      note: "",
      level: 0,
    });
    expect(schema.safeParse(stub).success).toBe(true);
  });

  it("leave out a field it may go without whose check cannot be read, and give the rest the nearest value", () => {
    const schema = z.object({
      code: z
        .string()
        .regex(/^[A-Z]{3}$/)
        .optional(),
      slug: z
        .string()
        .refine((text) => text.includes("-"))
        .optional(),
      when: z.date().optional(),
      precise: z.iso.datetime({ precision: 3 }).optional(),
      long: z.email().min(40).optional(),
      maybe: z.string().regex(/^x$/).nullable(),
      name: z.string().regex(/^[A-Z]/),
    });

    expect(extractSchemaStub(schema)).toEqual({ maybe: null, name: "" });
  });

  it("keep a Zod 3 schema's lower bounds", () => {
    const schema = z3.object({ every: z3.number().min(100), after: z3.number().gt(4) });

    expect(extractSchemaStub(schema)).toEqual({ every: 100, after: 5 });
  });

  it("give a Zod 3 field a value it takes, a native enum one of its numbers", () => {
    const schema = z3.object({
      category: z3.enum(["audio", "desk"]).optional(),
      kind: z3.literal("order"),
      level: z3.nativeEnum(LEVEL),
      contact: z3.string().email(),
      at: z3.string().datetime(),
      tags: z3.array(z3.string()).nonempty(),
      code: z3
        .string()
        .regex(/^[A-Z]+$/)
        .optional(),
      slug: z3
        .string()
        .refine((text) => text.length > 3)
        .optional(),
    });

    const stub = extractSchemaStub(schema);

    expect(stub).toEqual({
      category: "audio",
      kind: "order",
      level: 0,
      contact: "name@example.com",
      at: "2026-01-01T00:00:00Z",
      tags: [""],
    });
    expect(schema.safeParse(stub).success).toBe(true);
  });

  it("keep a Valibot schema's lower bounds, and pass it", () => {
    const schema = v.object({
      every: v.pipe(v.number(), v.minValue(100)),
      code: v.pipe(v.string(), v.minLength(2)),
    });

    const stub = extractSchemaStub(schema);

    expect(stub).toEqual({ every: 100, code: "xx" });
    expect(v.safeParse(schema, stub).success).toBe(true);
  });

  it("give a Valibot field a value it takes, an optional one by the schema it wraps", () => {
    const schema = v.object({
      category: v.optional(v.picklist(["audio", "desk"])),
      kind: v.literal("order"),
      contact: v.pipe(v.string(), v.email()),
      at: v.pipe(v.string(), v.isoTimestamp()),
      when: v.pipe(v.string(), v.isoDateTime()),
      size: v.optional(v.pipe(v.number(), v.minValue(3), v.maxValue(9))),
      tags: v.pipe(v.array(v.string()), v.minLength(1)),
      code: v.optional(v.pipe(v.string(), v.regex(/^[A-Z]+$/))),
      id: v.optional(v.pipe(v.string(), v.transform(Number), v.minValue(1))),
    });

    const stub = extractSchemaStub(schema);

    expect(stub).toEqual({
      category: "audio",
      kind: "order",
      contact: "name@example.com",
      at: "2026-01-01T00:00:00Z",
      when: "2026-01-01T00:00",
      size: 3,
      tags: [""],
    });
    expect(v.safeParse(schema, stub).success).toBe(true);
  });

  it("give an ArkType field a value it takes, read from its JSON Schema", () => {
    const schema = type({
      "category?": "'audio' | 'desk'",
      contact: "string.email",
      count: "number >= 3",
      tags: "string[] >= 1",
      "code?": "/^[A-Z]+$/",
    });

    const stub = extractSchemaStub(schema);

    expect(stub).toEqual({ category: "audio", contact: "name@example.com", count: 3, tags: [""] });
    expect(schema(stub) instanceof type.errors).toBe(false);
  });

  it("follow nested objects three levels down, as the field list does, and a recursive schema with them", () => {
    interface Tree {
      name: string;
      child?: Tree | undefined;
    }
    const tree: z.ZodType<Tree> = z.lazy(() =>
      z.object({ name: z.string(), child: tree.optional() }),
    );
    const deep = z.object({ a: z.object({ b: z.object({ c: z.object({ d: z.string() }) }) }) });

    expect(extractSchemaStub(deep)).toEqual({ a: { b: { c: {} } } });
    expect(extractSchemaStub(z.object({ root: tree }))).toEqual({
      root: { name: "", child: { name: "" } },
    });
  });

  it("fill no array past a hundred items, however many the schema asks for", () => {
    expect(extractSchemaStub(z.object({ ids: z.array(z.string()).min(1_000_000) }))).toEqual({
      ids: [],
    });
  });

  it("are none for a schema that is not an object schema, or one with no field given a value", () => {
    expect(extractSchemaStub(z.string())).toBeUndefined();
    expect(extractSchemaStub(undefined)).toBeUndefined();
    expect(
      extractSchemaStub(z.object({ code: z.string().regex(/^a/).optional() })),
    ).toBeUndefined();
  });
});
