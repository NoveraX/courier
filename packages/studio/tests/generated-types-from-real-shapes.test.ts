import { describe, expect, it } from "vitest";
import { generateCode } from "../src/apis/generator";
import { typeUnion, zodEnum } from "../src/apis/generator/enum-literals";
import { parseSpec } from "../src/apis/parser";

function generate(spec: object): string {
  return generateCode(parseSpec(JSON.stringify(spec)), {
    type: "openapi",
    sourceName: "api",
    outputDir: "src/api",
  })
    .map((f) => f.content)
    .join("\n");
}

function spec(schemas: Record<string, unknown>, extra: Record<string, unknown> = {}): object {
  return {
    openapi: "3.0.0",
    info: { title: "Shapes", version: "1.0.0" },
    paths: {
      "/things": {
        get: {
          operationId: "list",
          responses: {
            "200": {
              description: "ok",
              content: { "application/json": { schema: { $ref: "#/components/schemas/Root" } } },
            },
          },
        },
      },
    },
    components: { schemas },
    ...extra,
  };
}

describe("zodEnum", () => {
  it("uses z.enum only for strings", () => {
    expect(zodEnum(["read", "write"])).toBe('z.enum(["read", "write"])');
  });

  it("uses a literal for a boolean marker", () => {
    /* `{"type":"boolean","enum":[true]}` is how Stripe and OpenAI mark a
       deleted object, and `z.enum` takes string members only. */
    expect(zodEnum([true])).toBe("z.literal(true)");
  });

  it("uses a union for several non-string members", () => {
    expect(zodEnum([1, 2])).toBe("z.union([z.literal(1), z.literal(2)])");
  });

  it("escapes a member that contains a quote", () => {
    expect(zodEnum(['a"b'])).toBe('z.enum(["a\\"b"])');
  });

  it("gives up on an enum that lists nothing usable", () => {
    expect(zodEnum([null, undefined])).toBe("z.unknown()");
  });
});

describe("typeUnion", () => {
  it("writes literal types", () => {
    expect(typeUnion(["read", true, 2])).toBe('"read" | true | 2');
  });

  it("escapes a member that contains a quote", () => {
    expect(typeUnion(['a"b'])).toBe('"a\\"b"');
  });
});

describe("a boolean enum inside a schema", () => {
  it("is emitted as a literal, not as z.enum", () => {
    const out = generate(
      spec({
        Root: {
          type: "object",
          properties: { deleted: { type: "boolean", enum: [true] } },
          required: ["deleted"],
        },
      }),
    );

    expect(out).toContain("z.literal(true)");
    expect(out).not.toContain("z.enum([true])");
  });
});

describe("an object constrained by anyOf", () => {
  it("keeps the properties it declares", () => {
    /* OpenAI's ImageRefParam declares two properties and uses anyOf only to
       demand exactly one of them; reading that as a union lost both. */
    const out = generate(
      spec({
        Root: {
          type: "object",
          properties: { image_url: { type: "string" }, file_id: { type: "string" } },
          anyOf: [{ required: ["image_url"] }, { required: ["file_id"] }],
        },
      }),
    );

    expect(out).toContain("image_url");
    expect(out).toContain("file_id");
  });

  it("still reads a genuine union as a union", () => {
    const parsed = parseSpec(
      JSON.stringify(
        spec({
          Root: { anyOf: [{ type: "string" }, { type: "number" }] },
        }),
      ),
    );

    expect(parsed.schemas.Root?.type).not.toBe("object");
  });
});

describe("a reference nested deep inside an inline object", () => {
  it("is emitted, not just named", () => {
    /* Box references a schema from inside an inline object inside an array
       inside a property; the walk stopped one level short of it. */
    const out = generate(
      spec({
        Root: {
          type: "object",
          properties: {
            fields: {
              type: "array",
              items: {
                type: "object",
                properties: { rules: { $ref: "#/components/schemas/Rules" } },
              },
            },
          },
        },
        Rules: { type: "object", properties: { limit: { type: "integer" } } },
      }),
    );

    expect(out).toContain("Rules");
    expect(out).toMatch(/export type Rules\b|export const RulesSchema\b/);
  });
});
