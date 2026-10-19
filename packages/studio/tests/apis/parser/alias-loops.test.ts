/**
 * A schema that stands only for itself — a reference to another schema,
 * and so on until the chain comes back — names no value, so it is read as
 * unknown: written out, it was a type that referred to itself, which no
 * project compiles. A union that holds itself, or a schema of a loop with
 * it, takes what the loop's schemas take besides one another. A schema
 * referring into the loop stays a reference, and one naming itself inside
 * a list or a field stays as it is.
 */
import { afterAll, describe, expect, it } from "vitest";

import { generateCode } from "../../../src/apis/generator";
import { parseSpec } from "../../../src/apis/parser";
import { withoutAliasLoops } from "../../../src/apis/parser/alias-loops";
import type { ParsedSchema } from "../../../src/apis/parser/types";
import {
  compileProject,
  removeProjects,
  STRICT,
  writeProject,
} from "../../helpers/generated-project";

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });

function document(schemas: Record<string, unknown>): string {
  return JSON.stringify({
    openapi: "3.0.3",
    info: { title: "Shop", version: "1" },
    servers: [{ url: "https://shop.test" }],
    paths: {
      "/tags": {
        get: {
          operationId: "listTags",
          tags: ["tags"],
          responses: {
            200: { description: "ok", content: { "application/json": { schema: ref("Holder") } } },
          },
        },
      },
    },
    components: { schemas },
  });
}

const alias = (name: string, refName: string): ParsedSchema => ({ name, type: "ref", refName });

afterAll(() => removeProjects("alias-loops"));

describe("withoutAliasLoops", () => {
  it("reads a schema that is only itself as unknown", () => {
    expect(withoutAliasLoops({ Tag: alias("Tag", "Tag") })).toEqual({
      Tag: { name: "Tag", type: "any" },
    });
  });

  it("reads every schema of a loop as unknown, and keeps one leading into it a reference", () => {
    const read = withoutAliasLoops({
      Lead: alias("Lead", "A"),
      A: alias("A", "B"),
      B: {
        name: "B",
        type: "union",
        variants: [alias("BValue", "A"), { name: "BNull", type: "null" }],
      },
    });

    expect(read.Lead).toEqual(alias("Lead", "A"));
    expect(read.A).toEqual({ name: "A", type: "any" });
    expect(read.B).toEqual({ name: "B", type: "any" });
  });

  it("leaves a chain that ends in a schema of its own as it is", () => {
    const schemas = {
      A: alias("A", "B"),
      B: { name: "B", type: "object", properties: {}, required: [] } satisfies ParsedSchema,
    };

    expect(withoutAliasLoops(schemas)).toBe(schemas);
  });

  it("walks a chain of 100 000 references once", () => {
    const schemas = Object.fromEntries(
      Array.from({ length: 100_000 }, (_, at): [string, ParsedSchema] => [
        `S${at}`,
        alias(`S${at}`, `S${(at + 1) % 100_000}`),
      ]),
    );

    expect(Object.values(withoutAliasLoops(schemas)).every((schema) => schema.type === "any")).toBe(
      true,
    );
  });
});

describe("withoutAliasLoops, a union that holds itself", () => {
  const text: ParsedSchema = { name: "Text", type: "string" };
  const count: ParsedSchema = { name: "Count", type: "number" };

  it("is what it holds besides itself", () => {
    const read = withoutAliasLoops({
      Item: {
        name: "Item",
        type: "union",
        description: "An item",
        variants: [alias("ItemVariant1", "Item"), text],
      },
    });

    expect(read.Item).toEqual({ name: "Item", type: "string", description: "An item" });
  });

  it("takes, with every schema of its loop, what each holds besides the others", () => {
    const read = withoutAliasLoops({
      A: { name: "A", type: "union", variants: [alias("AVariant1", "B"), text] },
      B: { name: "B", type: "union", variants: [alias("BVariant1", "A"), count, text] },
      C: alias("C", "A"),
    });

    const both = [
      { ...text, name: "AVariant1" },
      { ...count, name: "AVariant2" },
    ];
    expect(read.A).toEqual({ name: "A", type: "union", variants: both });
    expect(read.B?.type === "union" && read.B.variants?.map((variant) => variant.type)).toEqual([
      "string",
      "number",
    ]);
    expect(read.C).toEqual(alias("C", "A"));
  });

  it("is what it holds besides itself where it holds itself through a union inside it", () => {
    const nullable = withoutAliasLoops({
      Item: {
        name: "Item",
        type: "union",
        variants: [
          {
            name: "ItemVariant1",
            type: "union",
            variants: [alias("ItemRef", "Item"), { name: "ItemNull", type: "null" }],
          },
          count,
        ],
      },
    });
    const nested = withoutAliasLoops({
      Item: {
        name: "Item",
        type: "union",
        variants: [
          { name: "ItemVariant1", type: "union", variants: [alias("ItemRef", "Item"), text] },
          count,
        ],
      },
    });

    expect(nullable.Item).toEqual({
      name: "Item",
      type: "union",
      variants: [
        { name: "ItemVariant1", type: "null" },
        { ...count, name: "ItemVariant2" },
      ],
    });
    expect(nested.Item).toEqual({
      name: "Item",
      type: "union",
      variants: [
        { ...text, name: "ItemVariant1" },
        { ...count, name: "ItemVariant2" },
      ],
    });
  });

  it("stays as it is where it names itself inside a list", () => {
    const schemas: Record<string, ParsedSchema> = {
      Tree: {
        name: "Tree",
        type: "union",
        variants: [{ name: "TreeVariant1", type: "array", items: alias("TreeItem", "Tree") }, text],
      },
    };

    expect(withoutAliasLoops(schemas)).toBe(schemas);
  });
});

describe("parseSpec, a schema that stands only for itself", () => {
  const SPEC = document({
    Tag: { description: "A tag", allOf: [ref("Tag")] },
    Holder: { type: "object", properties: { tag: ref("Tag") } },
  });

  it("is read as unknown, its description kept", () => {
    expect(parseSpec(SPEC).schemas.Tag).toEqual({ name: "Tag", type: "any", description: "A tag" });
  });

  it("generates code that compiles", () => {
    const files = generateCode(parseSpec(SPEC), { type: "openapi", outputDir: "src/api" }, "shop");
    const dir = writeProject("alias-loops/zod", files);

    expect(compileProject(dir, ["src/api/shop/index.ts"], STRICT)).toEqual([]);
  });
});

describe("parseSpec, a oneOf that holds itself", () => {
  const SPEC = document({
    Holder: {
      oneOf: [ref("Holder"), { type: "object", properties: { id: { type: "string" } } }],
    },
  });

  it.each([["zod"], ["valibot"], ["arktype"], ["none"]] as const)(
    "generates code that compiles, validated with %s",
    (validation) => {
      const files = generateCode(
        parseSpec(SPEC),
        { type: "openapi", outputDir: "src/api", validation, generateTypes: true },
        "shop",
      );
      const dir = writeProject(`alias-loops/one-of-${validation}`, files);

      expect(parseSpec(SPEC).schemas.Holder?.type).toBe("object");
      expect(compileProject(dir, ["src/api/shop/index.ts"], STRICT)).toEqual([]);
    },
    60_000,
  );
});

describe("parseSpec, a oneOf that holds itself through a union inside it", () => {
  const SPEC = document({
    Nullable: { oneOf: [{ ...ref("Nullable"), nullable: true }, { type: "number" }] },
    Composed: { oneOf: [{ allOf: [ref("Composed")], nullable: true }, { type: "number" }] },
    Nested: { oneOf: [{ oneOf: [ref("Nested"), { type: "string" }] }, { type: "number" }] },
    Holder: {
      type: "object",
      properties: { nullable: ref("Nullable"), composed: ref("Composed"), nested: ref("Nested") },
    },
  });

  it("is what it holds besides itself", () => {
    const { schemas } = parseSpec(SPEC);
    const types = (name: string) =>
      schemas[name]?.type === "union"
        ? schemas[name]?.variants?.map((variant) => variant.type)
        : [];

    expect(types("Nullable")).toEqual(["null", "number"]);
    expect(types("Composed")).toEqual(["null", "number"]);
    expect(types("Nested")).toEqual(["string", "number"]);
  });

  it.each([["zod"], ["valibot"], ["arktype"], ["none"]] as const)(
    "generates code that compiles, validated with %s",
    (validation) => {
      const files = generateCode(
        parseSpec(SPEC),
        { type: "openapi", outputDir: "src/api", validation, generateTypes: true },
        "shop",
      );
      const dir = writeProject(`alias-loops/inside-${validation}`, files);

      expect(compileProject(dir, ["src/api/shop/index.ts"], STRICT)).toEqual([]);
    },
    60_000,
  );
});
