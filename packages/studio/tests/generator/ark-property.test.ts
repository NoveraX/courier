/**
 * ArkType reads meaning into object keys — a trailing `?` makes a property
 * optional, `...` spreads another object in, `+` sets what becomes of
 * undeclared keys, `[…]` declares an index signature. A property the
 * specification names like one of those is generated under a key that means
 * exactly its name, so the schema checks that property, compiles, and keeps
 * a required one required.
 */
import { afterAll, describe, expect, it } from "vitest";

import { generateCode } from "../../src/apis/generator";
import { arkProperty } from "../../src/apis/generator/ark-property";
import { parseSpec } from "../../src/apis/parser";
import { generatedProject, loadGenerated } from "../helpers/generated-project";

const text = { type: "string" };

/** Named like ArkType's key syntax, or like its escapes of it. */
const REQUIRED = ["foo?", "...", "+", "[string]", "plain", "\\...", "\\+", "\\[x]", "?", "[x]?"];
const OPTIONAL = ["opt?", "[opt]", "...o", "a\\"];

const SPEC = parseSpec(
  JSON.stringify({
    openapi: "3.0.3",
    info: { title: "Keys", version: "1" },
    paths: {
      "/things": {
        post: {
          operationId: "makeThing",
          tags: ["things"],
          requestBody: {
            required: true,
            content: { "application/json": { schema: { $ref: "#/components/schemas/Thing" } } },
          },
          responses: { "200": { description: "ok" } },
        },
        get: {
          operationId: "findThings",
          tags: ["things"],
          parameters: [
            { name: "q?", in: "query", required: true, schema: text },
            { name: "+", in: "query", schema: text },
            { name: "[k]", in: "query", required: true, schema: text },
          ],
          responses: { "200": { description: "ok" } },
        },
      },
    },
    components: {
      schemas: {
        Thing: {
          type: "object",
          required: REQUIRED,
          properties: Object.fromEntries([...REQUIRED, ...OPTIONAL].map((name) => [name, text])),
        },
      },
    },
  }),
);

const FILES = generateCode(
  SPEC,
  { type: "openapi", outputDir: "src", validation: "arktype" },
  "keys",
);
const project = generatedProject("ark-property");

afterAll(() => project.remove());

interface StandardSchema {
  "~standard": { validate: (value: unknown) => { issues?: unknown[] } | Promise<unknown> };
}

function isStandardSchema(value: unknown): value is StandardSchema {
  return (
    (typeof value === "function" || (typeof value === "object" && value !== null)) &&
    "~standard" in value
  );
}

function schemaNamed(name: string): StandardSchema {
  const schema = loadGenerated(FILES, "src/keys/things/schemas.ts")[name];
  if (!isStandardSchema(schema)) throw new Error(`${name} is not a schema`);
  return schema;
}

function accepts(name: string, value: unknown): boolean {
  const result = schemaNamed(name)["~standard"].validate(value);
  if (result instanceof Promise) throw new Error("expected a synchronous validator");
  return result.issues === undefined;
}

const COMPLETE: Record<string, string> = Object.fromEntries(REQUIRED.map((name) => [name, "v"]));

describe("arkProperty", () => {
  it("escapes a name that reads as ArkType's key syntax", () => {
    expect(arkProperty("foo?", false, "V")).toBe(`${JSON.stringify("foo\\?")}: V`);
    expect(arkProperty("...", false, "V")).toBe(`${JSON.stringify("\\...")}: V`);
    expect(arkProperty("+", false, "V")).toBe(`${JSON.stringify("\\+")}: V`);
    expect(arkProperty("[string]", false, "V")).toBe(`${JSON.stringify("\\[string]")}: V`);
  });

  it("writes an ordinary name as it is, and an optional one with ArkType's `?`", () => {
    expect(arkProperty("plain", false, "V")).toBe('"plain": V');
    expect(arkProperty("plain", true, "V")).toBe('"plain?": V');
    expect(arkProperty("foo?", true, "V")).toBe('"foo??": V');
  });

  it("makes an optional name ending in a backslash optional through its value", () => {
    expect(arkProperty("a\\", true, "V")).toBe(`${JSON.stringify("a\\")}: V.optional()`);
  });
});

describe("a schema whose property names read as ArkType's key syntax", () => {
  it("accepts an object holding exactly those properties", () => {
    expect(accepts("ThingSchema", COMPLETE)).toBe(true);
  });

  it.each(REQUIRED)("refuses an object without the required property %s", (name) => {
    const { [name]: _left, ...rest } = COMPLETE;

    expect(accepts("ThingSchema", rest)).toBe(false);
  });

  it.each(REQUIRED)("checks the type of the property %s itself", (name) => {
    expect(accepts("ThingSchema", { ...COMPLETE, [name]: 1 })).toBe(false);
  });

  it.each(OPTIONAL)(
    "lets the optional property %s be left out, and checks it when given",
    (name) => {
      expect(accepts("ThingSchema", COMPLETE)).toBe(true);
      expect(accepts("ThingSchema", { ...COMPLETE, [name]: "v" })).toBe(true);
      expect(accepts("ThingSchema", { ...COMPLETE, [name]: 1 })).toBe(false);
    },
  );

  it("checks parameters named so: a required `q?` stays required", () => {
    const params = { "q?": "a", "[k]": "b" };

    expect(accepts("FindThingsParamsSchema", params)).toBe(true);
    expect(accepts("FindThingsParamsSchema", { "[k]": "b" })).toBe(false);
    expect(accepts("FindThingsParamsSchema", { ...params, "+": 1 })).toBe(false);
  });

  it("compiles under strict TypeScript, the schema satisfying its type", () => {
    expect(project.diagnostics("keys", FILES)).toEqual([]);
  }, 60_000);
});
