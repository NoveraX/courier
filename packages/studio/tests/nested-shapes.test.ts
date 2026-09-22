import { describe, expect, it } from "vitest";

import { parseSpec } from "../src/apis/parser";
import { generateCode, applyImportDefaults } from "../src/apis/generator";

type Validation = "zod" | "valibot" | "arktype";

function build(schemas: Record<string, unknown>, validation: Validation = "zod"): string {
  return generateCode(
    parseSpec(
      JSON.stringify({
        openapi: "3.0.0",
        info: { title: "N", version: "1" },
        paths: {
          "/things": {
            get: {
              operationId: "list",
              tags: ["things"],
              responses: {
                "200": {
                  description: "ok",
                  content: {
                    "application/json": { schema: { $ref: "#/components/schemas/Root" } },
                  },
                },
              },
            },
          },
        },
        components: { schemas },
      }),
    ),
    applyImportDefaults({ type: "openapi", sourceName: "api", outputDir: "src", validation }),
  )
    .map((f) => f.content)
    .join("\n");
}

const NESTED = {
  Root: {
    type: "object",
    properties: {
      owner: {
        type: "object",
        properties: { login: { type: "string" }, id: { type: "integer" } },
        required: ["login"],
      },
    },
  },
};

const MAP = {
  Root: {
    type: "object",
    properties: {
      labels: { type: "object", additionalProperties: { type: "string" } },
    },
  },
};

describe("an inline object property", () => {
  it("keeps its shape", () => {
    /* 813 properties across GitHub, Kubernetes and OpenAI were flattened to
       `Record<string, unknown>` and their shape thrown away. */
    const parsed = parseSpec(
      JSON.stringify({
        openapi: "3.0.0",
        info: { title: "N", version: "1" },
        paths: {},
        components: { schemas: NESTED },
      }),
    );

    expect(Object.keys(parsed.schemas.Root?.properties?.owner?.object?.properties ?? {})).toEqual([
      "login",
      "id",
    ]);
  });

  it("is written as an object type, not a record", () => {
    const out = build(NESTED);

    expect(out).toMatch(/owner\?: \{ login: string; id\?: number \}/);
    expect(out).not.toMatch(/owner\?: Record<string, unknown>/);
  });

  it.each(["zod", "valibot", "arktype"] as const)("is validated as an object by %s", (v) => {
    const out = build(NESTED, v);

    expect(out).toMatch(/login/);
  });
});

describe("a schema that declares only what its values look like", () => {
  it("is written as a record of that type", () => {
    /* Kubernetes declares 74 of these; they were emitted as an empty type
       nothing could be read from. */
    const out = build(MAP);

    expect(out).toMatch(/labels\?: Record<string, string>/);
  });

  it("is validated as a record of that type", () => {
    expect(build(MAP)).toMatch(/z\.record\(z\.string\(\), z\.string\(\)\)/);
  });
});

describe("a request body that is a list", () => {
  it("validates the list, not one element of it", () => {
    const out = generateCode(
      parseSpec(
        JSON.stringify({
          openapi: "3.0.0",
          info: { title: "N", version: "1" },
          paths: {
            "/things": {
              post: {
                operationId: "createMany",
                tags: ["things"],
                requestBody: {
                  content: {
                    "application/json": {
                      schema: { type: "array", items: { $ref: "#/components/schemas/Item" } },
                    },
                  },
                },
                responses: { "200": { description: "ok" } },
              },
            },
          },
          components: {
            schemas: { Item: { type: "object", properties: { id: { type: "string" } } } },
          },
        }),
      ),
      applyImportDefaults({ type: "openapi", sourceName: "api", outputDir: "src" }),
    )
      .map((f) => f.content)
      .join("\n");

    expect(out).toMatch(/\.variables\(z\.array\(ItemSchema\)\)/);
  });
});
