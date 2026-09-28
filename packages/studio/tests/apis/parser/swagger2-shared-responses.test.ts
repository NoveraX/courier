/**
 * A Swagger 2.0 operation may take its answer from the document's shared
 * responses — `"200": { "$ref": "#/responses/Pet" }`. Such an answer is
 * described exactly as the same response written in place, and comes in the
 * media type the operation produces: a shared response has none of its own.
 */
import { describe, expect, it } from "vitest";

import { parseSpec } from "../../../src/apis/parser";
import type { ParsedEndpoint, ParsedSpec } from "../../../src/apis/parser/types";

const PET = { type: "object", required: ["name"], properties: { name: { type: "string" } } };

function swagger(document: Record<string, unknown>): ParsedSpec {
  return parseSpec(JSON.stringify({ swagger: "2.0", info: { title: "Pets", version: "1" }, ...document }));
}

function endpoint(spec: ParsedSpec, name: string): ParsedEndpoint | undefined {
  return spec.groups.flatMap((group) => group.endpoints).find((ep) => ep.name === name);
}

function getPet(responses: Record<string, unknown>, shared: Record<string, unknown> = {}): ParsedEndpoint | undefined {
  const spec = swagger({
    definitions: { Pet: PET },
    responses: shared,
    paths: { "/pet": { get: { tags: ["pets"], operationId: "getPet", responses } } },
  });
  return endpoint(spec, "getPet");
}

describe("a Swagger 2.0 answer taken from the shared responses", () => {
  it("is described as the same response written in place", () => {
    const pet = { description: "A pet", schema: { $ref: "#/definitions/Pet" } };
    const inPlace = getPet({ "200": pet });

    const shared = getPet({ "200": { $ref: "#/responses/Pet" } }, { Pet: pet });

    expect(inPlace?.responseSchema).not.toBeNull();
    expect(shared?.responseSchema).toEqual(inPlace?.responseSchema);
    expect(shared?.responseMediaType).toBe("application/json");
  });

  it("comes in the media type each operation produces", () => {
    const spec = swagger({
      produces: ["application/json"],
      responses: { Name: { description: "A name", schema: { type: "string" } } },
      paths: {
        "/name": {
          get: { tags: ["names"], operationId: "readName", responses: { "200": { $ref: "#/responses/Name" } } },
        },
        "/name.txt": {
          get: {
            tags: ["names"],
            operationId: "readNameText",
            produces: ["text/plain"],
            responses: { "200": { $ref: "#/responses/Name" } },
          },
        },
      },
    });

    expect(endpoint(spec, "readName")?.responseMediaType).toBe("application/json");
    expect(endpoint(spec, "readNameText")?.responseMediaType).toBe("text/plain");
    expect(endpoint(spec, "readNameText")?.responseSchema).toEqual(endpoint(spec, "readName")?.responseSchema);
  });

  it("stays without a body when the shared response declares none", () => {
    const answer = getPet({ "200": { $ref: "#/responses/Empty" } }, { Empty: { description: "Nothing" } });

    expect(answer?.responseSchema).toBeNull();
    expect(answer?.responseMediaType).toBeUndefined();
  });

  it("stays without a body when the reference names no shared response", () => {
    const answer = getPet({ "200": { $ref: "#/responses/Missing" } });

    expect(answer?.responseSchema).toBeNull();
    expect(answer?.responseMediaType).toBeUndefined();
  });
});
