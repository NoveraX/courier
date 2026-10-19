/**
 * An object whose fields include a name every object inherits is written
 * through a helper its module declares, `_ownFields`, for each validation
 * library. Read by name, such a field the value left out was the member
 * every object has — `Object`'s own `constructor`, a function — and every
 * library refused it; zod checked no field `__proto__`, and valibot threw.
 * A value that leaves such a field out is now taken, one that gives it is
 * checked, a field `__proto__` is checked and kept as a field of its own,
 * and the object is described as its fields are.
 */

import { toOpenAPI } from "@noverax/courier/openapi";
import { extractSourceMap } from "@noverax/courier-studio-core";
import type { StandardSchemaV1 } from "@standard-schema/spec";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

import { type GenerateOptions, generateCode } from "../../src/apis/generator";
import { parseSpec } from "../../src/apis/parser";
import type { ParsedSpec } from "../../src/apis/parser/types";
import {
  compileProject,
  endpointAt,
  loadGenerated,
  removeProjects,
  STRICT,
  writeProject,
} from "../helpers/generated-project";

/* JSON text keeps a key `__proto__` as the field it names, as a specification's values arrive. */
const own = (json: string): unknown => JSON.parse(json);

const TEXT = `{
  "openapi": "3.0.3",
  "info": { "title": "Shop", "version": "1" },
  "servers": [{ "url": "https://shop.test" }],
  "components": {
    "schemas": {
      "Thing": {
        "type": "object",
        "required": ["id"],
        "properties": {
          "id": { "type": "string" },
          "constructor": { "type": "string" },
          "toString": { "type": "string", "maxLength": 5 },
          "valueOf": { "type": "number" },
          "zzproto": { "type": "string", "maxLength": 3 }
        }
      },
      "Strict": {
        "type": "object",
        "required": ["id", "zzproto"],
        "properties": { "id": { "type": "string" }, "zzproto": { "type": "integer" } }
      },
      "Note": {
        "type": "object",
        "required": ["id", "hasOwnProperty"],
        "properties": {
          "id": { "type": "string" },
          "constructor": { "type": "string" },
          "hasOwnProperty": { "type": "boolean" }
        }
      },
      "Box": {
        "type": "object",
        "required": ["thing"],
        "properties": {
          "thing": { "$ref": "#/components/schemas/Thing" },
          "note": { "$ref": "#/components/schemas/Note" },
          "list": { "type": "array", "items": { "$ref": "#/components/schemas/Thing" } }
        }
      }
    }
  },
  "paths": {
    "/things": {
      "post": {
        "operationId": "addThing",
        "tags": ["things"],
        "parameters": [{ "name": "dryRun", "in": "query", "schema": { "type": "boolean" } }],
        "requestBody": {
          "required": true,
          "content": { "application/json": { "schema": { "$ref": "#/components/schemas/Thing" } } }
        },
        "responses": {
          "200": {
            "description": "ok",
            "content": { "application/json": { "schema": { "$ref": "#/components/schemas/Box" } } }
          }
        }
      }
    },
    "/search": {
      "get": {
        "operationId": "searchThings",
        "tags": ["search"],
        "parameters": [
          {
            "name": "filter",
            "in": "query",
            "style": "deepObject",
            "explode": true,
            "schema": {
              "type": "object",
              "properties": { "toString": { "type": "string", "maxLength": 5 } }
            }
          }
        ],
        "responses": {
          "200": {
            "description": "ok",
            "content": { "application/json": { "schema": { "$ref": "#/components/schemas/Note" } } }
          }
        }
      }
    },
    "/boxes": {
      "post": {
        "operationId": "addBox",
        "tags": ["things"],
        "requestBody": {
          "required": true,
          "content": { "application/json": { "schema": { "$ref": "#/components/schemas/Box" } } }
        },
        "responses": { "204": { "description": "kept" } }
      }
    },
    "/strict": {
      "post": {
        "operationId": "addStrict",
        "tags": ["things"],
        "requestBody": {
          "required": true,
          "content": { "application/json": { "schema": { "$ref": "#/components/schemas/Strict" } } }
        },
        "responses": {
          "200": {
            "description": "ok",
            "content": { "application/json": { "schema": { "$ref": "#/components/schemas/Strict" } } }
          }
        }
      }
    }
  }
}`;

/* Each field \`zzproto\` written as a field \`__proto__\` of its own, as a specification sent to Studio holds it. */
const SPEC: ParsedSpec = JSON.parse(
  JSON.stringify(parseSpec(TEXT)).replaceAll('"zzproto"', '"__proto__"'),
);

const LIBRARIES = [["zod"], ["valibot"], ["arktype"]] as const;

/* A consumer of the generated types: a value that leaves every inherited name out is one. */
const CONSUMER = [
  'import { shopApi } from "./src/api/shop";',
  'import type { Strict, Thing } from "./src/api/shop";',
  "",
  'export const thing: Thing = { id: "a" };',
  'export const strict: Strict = { id: "a", ["__proto__"]: 1 };',
  'export const sent = shopApi.things.addThing({ id: "1", dryRun: true });',
  "export const found = shopApi.search.searchThings({ filter: {} });",
  "",
].join("\n");

function generated(validation: GenerateOptions["validation"]) {
  return generateCode(
    SPEC,
    { type: "openapi", outputDir: "src/api", validation, generateTypes: true },
    "shop",
  );
}

function schemaOf(validation: GenerateOptions["validation"], name: string): StandardSchemaV1 {
  const schemas = loadGenerated(generated(validation), "src/api/shop/things/schemas.ts");
  const schema = schemas[`${name}Schema`];
  if (typeof schema !== "object" && typeof schema !== "function") {
    throw new Error(`no ${name}Schema was generated`);
  }
  return schema as StandardSchemaV1;
}

async function validated(schema: StandardSchemaV1, value: unknown) {
  return schema["~standard"].validate(value);
}

const issuePaths = (result: StandardSchemaV1.Result<unknown>): string[] =>
  (result.issues ?? []).map((issue) =>
    (issue.path ?? [])
      .map((segment) => String(typeof segment === "object" ? segment.key : segment))
      .join("."),
  );

afterEach(() => vi.unstubAllGlobals());
afterAll(() => removeProjects("own-fields"));

describe.each(LIBRARIES)("an object with inherited names, validated with %s", (validation) => {
  it("takes a value that leaves every inherited name out, and gives it back as it is", async () => {
    const result = await validated(schemaOf(validation, "Thing"), { id: "a" });

    expect(result.issues).toBeUndefined();
    const value = "value" in result ? result.value : undefined;
    expect(value).toEqual({ id: "a" });
    expect(Object.hasOwn(value as object, "__proto__")).toBe(false);
    expect(Object.getPrototypeOf(value)).toBe(Object.prototype);
  });

  it("checks each one given, and keeps a field __proto__ as a field of its own", async () => {
    const result = await validated(
      schemaOf(validation, "Thing"),
      own('{ "id": "a", "constructor": "c", "valueOf": 1, "__proto__": "abc" }'),
    );

    const value = "value" in result ? result.value : undefined;
    expect(value).toMatchObject({ id: "a", constructor: "c", valueOf: 1 });
    expect(Object.getOwnPropertyDescriptor(value, "__proto__")?.value).toBe("abc");
    expect(Object.getPrototypeOf(value)).toBe(Object.prototype);
  });

  it("refuses one given that its schema refuses, at its own path", async () => {
    const schema = schemaOf(validation, "ThingInput");

    const wrong = await validated(schema, { id: "a", constructor: 5 });
    const long = await validated(schema, own('{ "id": "a", "__proto__": "abcdef" }'));
    const text = await validated(schema, { id: "a", toString: "longer" });
    const missing = await validated(schema, {});

    expect(issuePaths(wrong)).toEqual(["constructor"]);
    expect(issuePaths(long)).toEqual(["__proto__"]);
    expect(issuePaths(text)).toEqual(["toString"]);
    expect(issuePaths(missing)).toEqual(["id"]);
  });

  it("requires a field __proto__ the schema requires", async () => {
    const schema = schemaOf(validation, "Strict");

    const absent = await validated(schema, { id: "a" });
    const given = await validated(schema, own('{ "id": "a", "__proto__": 2 }'));

    expect(absent.issues?.length).toBeGreaterThan(0);
    expect(given.issues).toBeUndefined();
    const value = "value" in given ? given.value : undefined;
    expect(Object.getOwnPropertyDescriptor(value, "__proto__")?.value).toBe(2);
  });

  it("checks such objects inside another, in a list too", async () => {
    const schema = schemaOf(validation, "Box");

    const fine = await validated(schema, { thing: { id: "a" }, list: [{ id: "b" }] });
    const deep = await validated(
      schema,
      own('{ "thing": { "id": "a" }, "list": [{ "id": "b" }, { "id": "c", "__proto__": 5 }] }'),
    );

    expect(fine.issues).toBeUndefined();
    expect(issuePaths(deep)).toEqual(["list.1.__proto__"]);
  });

  it("checks the variables an endpoint adds its parameters to such an object with", async () => {
    const sent: string[] = [];
    vi.stubGlobal("fetch", async (input: Request | URL | string, init?: RequestInit) => {
      const request = new Request(input, init);
      sent.push(`${request.url} ${await request.text()}`);
      return Response.json({ thing: { id: "a" } });
    });
    const addThing = endpointAt(
      loadGenerated(generated(validation), "src/api/shop/index.ts").shopApi,
      "things",
      "addThing",
    );

    await addThing({ id: "1", dryRun: true });
    const refused = await addThing(own('{ "id": "1", "__proto__": "toolong" }')).catch(
      (error: unknown) => error,
    );

    expect(sent).toEqual(['https://shop.test/things?dryRun=true {"id":"1"}']);
    expect(refused).toBeInstanceOf(Error);
  });

  it("lists the fields of the variables in the Playground, and starts them with values it takes", async () => {
    const shop = loadGenerated(generated(validation), "src/api/shop/source.ts").shop;
    const map = extractSourceMap({ shop } as Parameters<typeof extractSourceMap>[0]);
    const addThing = map.shop?.groups.things?.endpoints.addThing;
    const variables = schemaOf(validation, "ThingInput");

    expect(addThing?.variablesFields?.map((field) => field.path)).toEqual(
      expect.arrayContaining(["id", "constructor", "toString", "valueOf", "__proto__", "dryRun"]),
    );
    expect(Object.hasOwn(Object(addThing?.variablesStub), "__proto__")).toBe(true);
    expect(Object.getPrototypeOf(addThing?.variablesStub)).toBe(Object.prototype);
    expect((await validated(variables, addThing?.variablesStub)).issues).toBeUndefined();
  });

  it("lists the fields of such objects inside another in the Playground", () => {
    const shop = loadGenerated(generated(validation), "src/api/shop/source.ts").shop;
    const map = extractSourceMap({ shop } as Parameters<typeof extractSourceMap>[0]);
    const addBox = map.shop?.groups.things?.endpoints.addBox;

    expect(addBox?.variablesFields?.map((field) => field.path)).toEqual(
      expect.arrayContaining([
        "thing.id",
        "thing.constructor",
        "thing.__proto__",
        "note.hasOwnProperty",
      ]),
    );
  });

  it("compiles with every check on, a consumer that leaves the inherited names out among it", () => {
    const dir = writeProject(`own-fields/${validation}`, generated(validation), {
      "consumer.ts": CONSUMER,
    });

    expect(
      compileProject(dir, ["consumer.ts"], {
        ...STRICT,
        exactOptionalPropertyTypes: true,
        noUnusedLocals: true,
        noUnusedParameters: true,
      }),
    ).toEqual([]);
  }, 60_000);
});

describe("an object with inherited names, described", () => {
  it("is described as its fields are by zod, its field __proto__ among them", () => {
    const shop = loadGenerated(generated("zod"), "src/api/shop/source.ts").shop;
    const document = toOpenAPI(shop as Parameters<typeof toOpenAPI>[0]);
    const operation = document.paths["/things"]?.post;
    const body = operation?.requestBody;
    const answer = operation?.responses["200"];

    expect(JSON.stringify(body)).toContain('"__proto__":{"type":"string","maxLength":3}');
    expect(body).toMatchObject({
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: { id: { type: "string" }, constructor: { type: "string" } },
            required: ["id"],
          },
        },
      },
    });
    /* Inside another, zod describes it by its fields while it has no field `__proto__`, and leaves it unspecified with one. */
    expect(JSON.stringify(answer)).toContain('"thing":{}');
    expect(answer).toMatchObject({
      content: {
        "application/json": {
          schema: {
            properties: {
              note: { properties: { id: { type: "string" }, constructor: { type: "string" } } },
              thing: {},
            },
          },
        },
      },
    });
  });

  it("is described by ArkType as its fields are, its field __proto__ among them, wherever it sits", () => {
    const shop = loadGenerated(generated("arktype"), "src/api/shop/source.ts").shop;
    const document = toOpenAPI(shop as Parameters<typeof toOpenAPI>[0]);
    const operation = document.paths["/things"]?.post;
    const body = operation?.requestBody;
    const answer = operation?.responses["200"];

    expect(JSON.stringify(body)).toContain('"__proto__":{"type":"string","maxLength":3}');
    expect(body).toMatchObject({
      content: {
        "application/json": {
          schema: { type: "object", properties: { constructor: { type: "string" } } },
        },
      },
    });
    /* Inside another schema its check carries its description, so it is written as it is alone. */
    expect(answer).toMatchObject({
      content: {
        "application/json": {
          schema: {
            properties: {
              note: { properties: { id: { type: "string" }, constructor: { type: "string" } } },
              thing: { properties: { id: { type: "string" } } },
              list: { items: { properties: { id: { type: "string" } } } },
            },
          },
        },
      },
    });
    expect(JSON.stringify(answer)).toContain('"__proto__":{"type":"string"}');
  });
});
