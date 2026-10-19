/**
 * A field a specification names `__proto__` is a field like any other: a
 * key of its own in every record of fields Studio reads — a component's
 * properties, an inline body's, an `allOf` member's, a form's fields and
 * their encodings, a Swagger 2 `formData`, a Postman body's — where it set
 * the record's prototype and went missing, though `required` still listed
 * it. The records keep the ordinary prototype, and a JSON round trip keeps
 * the field.
 */
import { describe, expect, it } from "vitest";

import { parseSpec } from "../../../src/apis/parser";
import type { ParsedSchema, ParsedSpec } from "../../../src/apis/parser/types";

const PROTO = "__proto__";

/* A schema of fields, JSON text keeping `__proto__` as a key the way a specification spells it. */
const fields = (required: readonly string[]) =>
  `{ "type": "object", "required": ${JSON.stringify(required)}, "properties": { "${PROTO}": { "type": "string", "maxLength": 3 }, "id": { "type": "string" } } }`;

function openapi(paths: string, schemas = "{}"): string {
  return `{ "openapi": "3.0.3", "info": { "title": "Shop", "version": "1" }, "paths": ${paths}, "components": { "schemas": ${schemas} } }`;
}

function post(body: string): string {
  return `{ "/things": { "post": { "operationId": "addThing", "requestBody": { "required": true, "content": ${body} }, "responses": { "200": { "description": "ok" } } } } }`;
}

/* The record holds `__proto__` as a key of its own, with the ordinary prototype. */
function expectOwnProto(record: object | undefined): void {
  expect(record).toBeDefined();
  expect(Object.hasOwn(record ?? {}, PROTO)).toBe(true);
  expect(Object.getPrototypeOf(record)).toBe(Object.prototype);
}

function bodyOf(spec: ParsedSpec): ParsedSchema | null | undefined {
  return spec.groups.flatMap((group) => group.endpoints)[0]?.requestBody;
}

describe("parseSpec, a field named __proto__", () => {
  it("is a property of its own of a component, required as the schema says", () => {
    const spec = parseSpec(openapi("{}", `{ "Thing": ${fields([PROTO, "id"])} }`));
    const thing = spec.schemas.Thing;

    expectOwnProto(thing?.properties);
    expect(thing?.properties?.[PROTO]).toMatchObject({ type: "string", required: true });
    expect(thing?.required).toEqual([PROTO, "id"]);
    expect(Object.hasOwn(JSON.parse(JSON.stringify(spec)).schemas.Thing.properties, PROTO)).toBe(
      true,
    );
  });

  it("is a field of its own of an inline body, and of an allOf member merged in", () => {
    const inline = parseSpec(
      openapi(post(`{ "application/json": { "schema": ${fields([PROTO])} } }`)),
    );
    const composed = parseSpec(
      openapi(
        post(
          `{ "application/json": { "schema": { "allOf": [${fields([PROTO])}, { "properties": { "q": { "type": "string" } } }] } } }`,
        ),
      ),
    );

    expectOwnProto(bodyOf(inline)?.properties);
    expect(bodyOf(inline)?.required).toEqual([PROTO]);
    expectOwnProto(bodyOf(composed)?.properties);
    expect(Object.keys(bodyOf(composed)?.properties ?? {})).toEqual([PROTO, "id", "q"]);
  });

  it("is a field of its own of a form, with its encoding", () => {
    const encoding = `{ "${PROTO}": { "style": "deepObject", "explode": true } }`;
    const spec = parseSpec(
      openapi(
        post(
          `{ "application/x-www-form-urlencoded": { "schema": ${fields([])}, "encoding": ${encoding} } }`,
        ),
      ),
    );
    const endpoint = spec.groups[0]?.endpoints[0];

    expectOwnProto(endpoint?.requestBody?.properties);
    expectOwnProto(endpoint?.requestBodyEncoding);
  });

  it("is a field of its own of a Swagger 2 formData, with its collection format", () => {
    const parameters = `[{ "name": "${PROTO}", "in": "formData", "type": "array", "items": { "type": "string" }, "collectionFormat": "pipes", "required": true }]`;
    const spec = parseSpec(
      `{ "swagger": "2.0", "info": { "title": "Shop", "version": "1" }, "paths": { "/things": { "post": { "operationId": "addThing", "consumes": ["application/x-www-form-urlencoded"], "parameters": ${parameters}, "responses": { "200": { "description": "ok" } } } } } }`,
    );
    const endpoint = spec.groups[0]?.endpoints[0];

    expectOwnProto(endpoint?.requestBody?.properties);
    expect(endpoint?.requestBody?.required).toEqual([PROTO]);
    expectOwnProto(endpoint?.requestBodyEncoding);
  });

  it("is a field of its own of a Postman body, raw or a form", () => {
    const collection = (body: string) =>
      `{ "info": { "name": "Shop", "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json" }, "item": [{ "name": "Add thing", "request": { "method": "POST", "url": "https://shop.test/things", "body": ${body} } }] }`;
    const raw = parseSpec(
      collection(`{ "mode": "raw", "raw": ${JSON.stringify(`{ "${PROTO}": "x", "id": "1" }`)} }`),
    );
    const form = parseSpec(
      collection(`{ "mode": "urlencoded", "urlencoded": [{ "key": "${PROTO}", "value": "x" }] }`),
    );

    expectOwnProto(bodyOf(raw)?.properties);
    expectOwnProto(bodyOf(form)?.properties);
  });

  it("is a property of its own of a component a YAML document declares", () => {
    const yaml = [
      "openapi: 3.0.3",
      "info: { title: Shop, version: '1' }",
      "paths: {}",
      "components:",
      "  schemas:",
      "    Thing:",
      "      type: object",
      "      required: [__proto__]",
      "      properties:",
      "        __proto__: { type: string }",
      "",
    ].join("\n");

    expectOwnProto(parseSpec(yaml).schemas.Thing?.properties);
  });
});

describe("parseSpec, a field named like a member every object has", () => {
  it("is required only when the schema says so", () => {
    const schema = `{ "type": "object", "properties": { "constructor": { "type": "string" }, "toString": { "type": "string" } } }`;
    const thing = parseSpec(openapi("{}", `{ "Thing": ${schema} }`)).schemas.Thing;

    expect(thing?.required).toEqual([]);
    expect(Object.keys(thing?.properties ?? {})).toEqual(["constructor", "toString"]);
  });
});
