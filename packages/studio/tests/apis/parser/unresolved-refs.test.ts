/**
 * A reference that points nowhere — at a component the document does not
 * declare, at a part it does not hold, into another file, or through an
 * escape that decodes to no text — is read as unknown, and the parse says
 * so among what it left out, by the JSON pointer of each place the
 * document writes it. Referred to by name, a component nothing declared
 * became code naming a type nothing declared.
 */
import { describe, expect, it } from "vitest";

import { parseSpec } from "../../../src/apis/parser";
import type { ParsedSchema } from "../../../src/apis/parser/types";

const missing = (ref: string, reading = "its value is read as unknown") =>
  `it refers to ${ref}, which this document does not hold, so ${reading}`;

const OWNER = "#/components/schemas/Owner";

function document(extra: { paths?: unknown; schemas?: unknown } = {}): string {
  return JSON.stringify({
    openapi: "3.0.3",
    info: { title: "Shop", version: "1" },
    paths: extra.paths ?? {},
    components: { schemas: extra.schemas ?? {} },
  });
}

function property(schema: ParsedSchema | undefined, name: string): unknown {
  return schema?.type === "object" ? schema.properties?.[name] : undefined;
}

const ok = (schema: unknown) => ({
  200: { description: "ok", content: { "application/json": { schema } } },
});

describe("parseSpec, references that point nowhere", () => {
  it("reads a property referring to a component nobody declares as unknown, and says where", () => {
    const pet = { type: "object", properties: { owner: { $ref: OWNER } } };
    const spec = parseSpec(document({ schemas: { Pet: pet } }));

    expect(property(spec.schemas.Pet, "owner")).toMatchObject({ type: "any" });
    expect(spec.skipped).toEqual([
      { method: "REF", path: "#/components/schemas/Pet/properties/owner", reason: missing(OWNER) },
    ]);
  });

  it("reads list items, an answer and an allOf member referring to nothing as unknown", () => {
    const pets = { type: "array", items: { $ref: OWNER } };
    const dog = {
      allOf: [{ $ref: "#/components/schemas/Pet" }, { $ref: "#/components/schemas/Gone" }],
    };
    const paths = {
      "/owners": { get: { operationId: "listOwners", responses: ok({ $ref: OWNER }) } },
    };
    const spec = parseSpec(
      document({ paths, schemas: { Pets: pets, Dog: dog, Pet: { type: "object" } } }),
    );

    expect(spec.schemas.Pets).toMatchObject({ type: "array", items: { type: "any" } });
    expect(spec.groups[0]?.endpoints[0]?.responseSchema).toMatchObject({ type: "any" });
    expect(spec.skipped.map((entry) => `${entry.method} ${entry.path}`)).toEqual([
      "REF #/components/schemas/Dog/allOf/1",
      "REF #/components/schemas/Pets/items",
      "REF #/paths/~1owners/get/responses/200/content/application~1json/schema",
    ]);
    expect(spec.skipped[0]?.reason).toBe(
      missing("#/components/schemas/Gone", "what it adds is left out"),
    );
  });

  it("reads a parameter whose schema refers to nothing as a string", () => {
    const parameters = [
      { name: "sort", in: "query", schema: { $ref: "#/components/schemas/Sort" } },
    ];
    const paths = { "/pets": { get: { operationId: "listPets", parameters, responses: ok({}) } } };
    const spec = parseSpec(document({ paths }));

    expect(spec.groups[0]?.endpoints[0]?.parameters[0]).toMatchObject({
      name: "sort",
      type: "string",
    });
    expect(spec.skipped).toEqual([
      {
        method: "REF",
        path: "#/paths/~1pets/get/parameters/0/schema",
        reason: missing("#/components/schemas/Sort", "its value is read as a string"),
      },
    ]);
  });

  it("reads an operation whose body points nowhere without a body, and its answer as unknown", () => {
    const body = "#/components/requestBodies/NewPet";
    const answer = "#/components/responses/PetCreated";
    const post = {
      operationId: "addPet",
      requestBody: { $ref: body },
      responses: { 201: { $ref: answer } },
    };
    const spec = parseSpec(document({ paths: { "/pets": { post } } }));

    expect(spec.groups[0]?.endpoints[0]).toMatchObject({ requestBody: null, responseSchema: null });
    expect(spec.skipped).toEqual([
      {
        method: "REF",
        path: "#/paths/~1pets/post/requestBody",
        reason: missing(body, "the operation is read without a body"),
      },
      {
        method: "REF",
        path: "#/paths/~1pets/post/responses/201",
        reason: missing(answer, "its answer is read as unknown"),
      },
    ]);
  });

  it("lists a reference into another file and one whose escape decodes to no text", () => {
    const pet = {
      type: "object",
      properties: {
        tag: { $ref: "common.yaml#/components/schemas/Tag" },
        zone: { $ref: "#/components/schemas/%zz" },
      },
    };
    const spec = parseSpec(document({ schemas: { Pet: pet } }));

    expect(spec.skipped.map((entry) => entry.path)).toEqual([
      "#/components/schemas/Pet/properties/tag",
      "#/components/schemas/Pet/properties/zone",
    ]);
  });

  it("lists each place the document writes the same reference", () => {
    const pet = { type: "object", properties: { owner: { $ref: OWNER }, sitter: { $ref: OWNER } } };

    expect(
      parseSpec(document({ schemas: { Pet: pet } })).skipped.map((entry) => entry.path),
    ).toEqual([
      "#/components/schemas/Pet/properties/owner",
      "#/components/schemas/Pet/properties/sitter",
    ]);
  });

  it("lists a Swagger 2.0 reference to a definition nobody declares", () => {
    const pet = { type: "object", properties: { owner: { $ref: "#/definitions/Owner" } } };
    const swagger = { swagger: "2.0", info: { title: "Shop", version: "1" }, paths: {} };
    const spec = parseSpec(JSON.stringify({ ...swagger, definitions: { Pet: pet } }));

    expect(property(spec.schemas.Pet, "owner")).toMatchObject({ type: "any" });
    expect(spec.skipped.map((entry) => entry.path)).toEqual(["#/definitions/Pet/properties/owner"]);
  });

  it("lists nothing when every reference points somewhere", () => {
    const pet = { type: "object", properties: { owner: { $ref: OWNER } } };
    const owner = { type: "object", properties: { name: { type: "string" } } };

    expect(parseSpec(document({ schemas: { Pet: pet, Owner: owner } })).skipped).toEqual([]);
  });
});
