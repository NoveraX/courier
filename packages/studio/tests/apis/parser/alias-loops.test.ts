/**
 * A schema that stands only for itself — a reference to another schema,
 * and so on until the chain comes back — names no value, so it is read as
 * unknown: written out, it was a type that referred to itself, which no
 * project compiles. A schema referring into the loop stays a reference.
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
