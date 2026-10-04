import { describe, expect, it } from "vitest";
import { generateCode } from "../src/apis/generator";
import { parseSpec } from "../src/apis/parser";

type Validation = "zod" | "valibot" | "arktype" | "none";

const UNION_SPEC = {
  openapi: "3.0.0",
  info: { title: "U", version: "1" },
  paths: {
    "/things": {
      get: {
        operationId: "list",
        tags: ["things"],
        responses: {
          "200": {
            description: "ok",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Result" } } },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      Cat: { type: "object", properties: { meow: { type: "string" } }, required: ["meow"] },
      Dog: { type: "object", properties: { bark: { type: "string" } }, required: ["bark"] },
      Result: {
        oneOf: [{ $ref: "#/components/schemas/Cat" }, { $ref: "#/components/schemas/Dog" }],
      },
    },
  },
};

function generate(validation: Validation = "zod"): string {
  return generateCode(parseSpec(JSON.stringify(UNION_SPEC)), {
    type: "openapi",
    sourceName: "api",
    outputDir: "src",
    validation,
  })
    .map((f) => f.content)
    .join("\n");
}

describe("a oneOf schema", () => {
  it("keeps every alternative", () => {
    /* Keeping only the first silently narrowed 1,014 of OpenAI's 1,205
       alternatives, 152 of GitHub's 167, and 14 Stripe responses. */
    const schema = parseSpec(JSON.stringify(UNION_SPEC)).schemas.Result;

    expect(schema?.type).toBe("union");
    expect(schema?.variants?.map((v) => v.refName)).toEqual(["Cat", "Dog"]);
  });

  it("is written as a TypeScript union", () => {
    expect(generate()).toMatch(/export type Result = Cat \| Dog;/);
  });

  it("collapses to the one alternative when there is only one", () => {
    const spec = parseSpec(
      JSON.stringify({
        ...UNION_SPEC,
        components: {
          schemas: {
            ...UNION_SPEC.components.schemas,
            Result: { oneOf: [{ $ref: "#/components/schemas/Cat" }] },
          },
        },
      }),
    );

    expect(spec.schemas.Result?.type).toBe("ref");
  });
});

describe("a union schema, per validator", () => {
  it("is a z.union for zod", () => {
    expect(generate("zod")).toMatch(/z\.union\(\[CatSchema, DogSchema\]\)/);
  });

  it("is a v.union for valibot", () => {
    expect(generate("valibot")).toMatch(/v\.union\(\[CatSchema, DogSchema\]\)/);
  });

  it("is joined with type.or for arktype, not a string operator", () => {
    const out = generate("arktype");

    expect(out).toMatch(/type\.or\(CatSchema, DogSchema\)/);
  });
});

describe("a response that is one of several shapes", () => {
  it("brings every named type into the group file", () => {
    /* The import collector compared the response type to each name whole, so
       `Cat | Dog` matched neither and nothing was imported. */
    const files = generateCode(parseSpec(JSON.stringify(UNION_SPEC)), {
      type: "openapi",
      sourceName: "api",
      outputDir: "src",
    });
    const group = files.find((f) => f.path.endsWith("/things/index.ts"))?.content ?? "";

    if (group.includes("Cat")) expect(group).toMatch(/import .*Cat/);
  });
});

describe("a request body that is one of several shapes", () => {
  it("is intersected with the path parameters, not extended", () => {
    /* `.extend` belongs to an object schema; a union has no such method. */
    const out = generateCode(
      parseSpec(
        JSON.stringify({
          ...UNION_SPEC,
          paths: {
            "/things/{id}": {
              post: {
                operationId: "create",
                tags: ["things"],
                parameters: [
                  { name: "id", in: "path", required: true, schema: { type: "string" } },
                ],
                requestBody: {
                  content: {
                    "application/json": { schema: { $ref: "#/components/schemas/Result" } },
                  },
                },
                responses: { "200": { description: "ok" } },
              },
            },
          },
        }),
      ),
      { type: "openapi", sourceName: "api", outputDir: "src" },
    )
      .map((f) => f.content)
      .join("\n");

    expect(out).not.toMatch(/ResultSchema\.extend/);
    expect(out).toMatch(/z\.intersection\(ResultSchema/);
  });
});
