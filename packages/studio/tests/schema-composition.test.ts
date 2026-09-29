import { describe, expect, it } from "vitest";
import { generateCode } from "../src/apis/generator";
import { parseSpec } from "../src/apis/parser";

function parse(components: Record<string, unknown>, version = "3.0.0") {
  return parseSpec(
    JSON.stringify({
      openapi: version,
      info: { title: "T", version: "1" },
      paths: {},
      components: { schemas: components },
    }),
  );
}

describe("allOf", () => {
  it("keeps the properties of the base it references", () => {
    /* GitHub composes five schemas this way; the inherited half was dropped
       from the type and then stripped off every response by the validator. */
    const spec = parse({
      Base: {
        type: "object",
        properties: { id: { type: "string" }, createdAt: { type: "string" } },
        required: ["id"],
      },
      Derived: {
        allOf: [
          { $ref: "#/components/schemas/Base" },
          { type: "object", properties: { name: { type: "string" } } },
        ],
      },
    });

    expect(Object.keys(spec.schemas.Derived?.properties ?? {}).sort()).toEqual([
      "createdAt",
      "id",
      "name",
    ]);
  });

  it("follows a base that is itself composed", () => {
    const spec = parse({
      Root: { type: "object", properties: { a: { type: "string" } } },
      Middle: {
        allOf: [
          { $ref: "#/components/schemas/Root" },
          { type: "object", properties: { b: { type: "string" } } },
        ],
      },
      Leaf: {
        allOf: [
          { $ref: "#/components/schemas/Middle" },
          { type: "object", properties: { c: { type: "string" } } },
        ],
      },
    });

    expect(Object.keys(spec.schemas.Leaf?.properties ?? {}).sort()).toEqual(["a", "b", "c"]);
  });

  it("does not loop on a base that references itself", () => {
    const spec = parse({
      Loop: {
        allOf: [
          { $ref: "#/components/schemas/Loop" },
          { type: "object", properties: { a: { type: "string" } } },
        ],
      },
    });

    expect(Object.keys(spec.schemas.Loop?.properties ?? {})).toEqual(["a"]);
  });
});

describe("an OpenAPI 3.1 nullable type", () => {
  it("keeps the type it names", () => {
    /* 3.1 writes `"type": ["string", "null"]`; reading that as a type name
       left the property as `unknown`. */
    const spec = parse(
      { N: { type: "object", properties: { a: { type: ["string", "null"] } } } },
      "3.1.0",
    );

    expect(spec.schemas.N?.properties?.a).toMatchObject({ type: "string", nullable: true });
  });

  it("keeps a schema declared that way too, and its null", () => {
    const spec = parse({ S: { type: ["integer", "null"] } }, "3.1.0");

    expect(spec.schemas.S?.type).toBe("union");
    expect(spec.schemas.S?.variants?.map((variant) => variant.type)).toEqual(["integer", "null"]);
  });
});

describe("a group whose prefix carries path placeholders", () => {
  it("writes them the way the caller builds a URL", () => {
    /* 27 of Twilio's 75 groups are shaped this way; the specification's
       braces went into the request URL verbatim. */
    const spec = parseSpec(
      JSON.stringify({
        openapi: "3.0.0",
        info: { title: "T", version: "1" },
        paths: {
          "/Accounts/{AccountSid}/Calls/{CallSid}/Recordings": {
            get: {
              operationId: "listRecordings",
              tags: ["recordings"],
              responses: { "200": { description: "ok" } },
            },
          },
        },
      }),
    );

    for (const group of spec.groups) {
      expect(group.prefix).not.toContain("{");
    }
    expect(spec.groups[0]?.prefix).toContain(":AccountSid");
  });
});

describe("text a specification supplies to the source file", () => {
  it("is escaped", () => {
    const generated = generateCode(
      parseSpec(
        JSON.stringify({
          openapi: "3.0.0",
          info: { title: "T", version: "1" },
          servers: [{ url: 'https://api.test/a"b' }],
          paths: {
            "/things": {
              get: {
                operationId: "list",
                tags: ["things"],
                responses: { "200": { description: "ok" } },
              },
            },
          },
          components: {
            securitySchemes: { k: { type: "apiKey", in: "header", name: 'X-"Key' } },
          },
          security: [{ k: [] }],
        }),
      ),
      {
        type: "openapi",
        sourceName: "api",
        outputDir: "src",
        addAuthMiddleware: true,
      },
    );
    const source = generated.find((f) => f.path.endsWith("source.ts"))?.content ?? "";

    expect(source).toContain('a\\"b');
    expect(source).toContain('X-\\"Key');
  });
});
