/**
 * The form a property's schema takes: a property whose `allOf` adds up two
 * schemas — two it refers to, or one and a composition — takes the fields
 * of both, where it took the first one's alone; one that names a single
 * schema and annotates it stays a reference to that schema.
 */
import { describe, expect, it } from "vitest";

import { generateCode } from "../../../src/apis/generator";
import { parseSpec } from "../../../src/apis/parser";
import { isComposite } from "../../../src/apis/parser/property-forms";
import type { ParsedSchema } from "../../../src/apis/parser/types";

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });

const A = { type: "object", properties: { a: { type: "string" } } };
const B = { type: "object", properties: { b: { type: "string" } } };

function holder(both: unknown): string {
  return JSON.stringify({
    openapi: "3.0.3",
    info: { title: "Shop", version: "1" },
    servers: [{ url: "https://shop.test" }],
    paths: {
      "/holders": {
        get: {
          operationId: "getHolder",
          tags: ["holders"],
          responses: {
            200: { description: "ok", content: { "application/json": { schema: ref("Holder") } } },
          },
        },
      },
    },
    components: { schemas: { A, B, Holder: { type: "object", properties: { both } } } },
  });
}

function both(schema: ParsedSchema | undefined): unknown {
  return schema?.type === "object" ? schema.properties?.both : undefined;
}

describe("isComposite", () => {
  it("takes an allOf of two schemas it refers to, or one and a composition, as composed", () => {
    expect(isComposite({ allOf: [ref("A"), ref("B")] })).toBe(true);
    expect(isComposite({ allOf: [ref("A"), { allOf: [ref("B")] }] })).toBe(true);
    expect(isComposite({ allOf: [ref("A"), { properties: { c: {} } }] })).toBe(true);
  });

  it("takes an allOf that names one schema, however often, and annotates it, as that schema", () => {
    expect(isComposite({ allOf: [ref("A")] })).toBe(false);
    expect(isComposite({ allOf: [ref("A"), { description: "The holder's A" }] })).toBe(false);
    expect(isComposite({ allOf: [ref("A"), ref("A")] })).toBe(false);
  });
});

describe("parseSpec, a property composed of two schemas", () => {
  it("takes the fields of both", () => {
    const { schemas } = parseSpec(holder({ allOf: [ref("A"), ref("B")] }));

    expect(both(schemas.Holder)).toMatchObject({
      type: "object",
      shape: { type: "object", properties: { a: { type: "string" }, b: { type: "string" } } },
    });
  });

  it("takes the fields of a composition among its members", () => {
    const { schemas } = parseSpec(holder({ allOf: [ref("A"), { allOf: [ref("B")] }] }));

    expect(both(schemas.Holder)).toMatchObject({
      shape: { properties: { a: {}, b: {} } },
    });
  });

  it("stays a reference to the one schema an annotated allOf names", () => {
    const { schemas } = parseSpec(holder({ allOf: [ref("A"), { description: "The holder's A" }] }));

    expect(both(schemas.Holder)).toMatchObject({ type: "ref", refName: "A" });
  });

  it("is generated with the fields of both", () => {
    const files = generateCode(
      parseSpec(holder({ allOf: [ref("A"), ref("B")] })),
      { type: "openapi", outputDir: "src/api", validation: "none" },
      "shop",
    );
    const schemas = files.find((file) => file.path === "src/api/shop/holders/schemas.ts");

    expect(schemas?.content).toMatch(/both\?: \{ a\?: string; b\?: string \}/);
  });
});
