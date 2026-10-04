/**
 * The sample variables the Playground starts a call with pass the schema: a
 * number at least its lower bound, a string at least its minimum length — so
 * `z.number().min(100)` starts at 100, not at a `0` the first send would
 * have refused.
 */
import * as v from "valibot";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { z as z3 } from "zod/v3";

import { extractSchemaStub } from "../src/source-map-schema";

describe("the sample variables of a schema", () => {
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

  it("keep a Zod 3 schema's lower bounds", () => {
    const schema = z3.object({ every: z3.number().min(100), after: z3.number().gt(4) });

    expect(extractSchemaStub(schema)).toEqual({ every: 100, after: 5 });
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

  it("are none for a schema that is not an object schema", () => {
    expect(extractSchemaStub(z.string())).toBeUndefined();
    expect(extractSchemaStub(undefined)).toBeUndefined();
  });
});
