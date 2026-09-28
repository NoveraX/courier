/**
 * The media type a request body is sent as, kept beside its schema whichever
 * format the specification is written in.
 */
import { describe, expect, it } from "vitest";

import { parseSpec } from "../../../src/apis/parser";
import type { ParsedSpec } from "../../../src/apis/parser/types";

function mediaTypes(spec: ParsedSpec): Record<string, string | undefined> {
  const endpoints = spec.groups.flatMap((group) => group.endpoints);
  return Object.fromEntries(endpoints.map((endpoint) => [endpoint.name, endpoint.requestBodyMediaType]));
}

const FIELDS = { type: "object", properties: { email: { type: "string" } } };

describe("an OpenAPI 3 request body", () => {
  it("keeps the media type its schema is written under", () => {
    const post = (operationId: string, content: Record<string, unknown>) => ({
      post: { tags: ["c"], operationId, requestBody: { content }, responses: { "200": { description: "ok" } } },
    });
    const spec = parseSpec(
      JSON.stringify({
        openapi: "3.0.3",
        info: { title: "Stripe", version: "1" },
        paths: {
          "/customers": post("createCustomer", {
            "application/x-www-form-urlencoded": { schema: FIELDS },
          }),
          "/files": post("uploadFile", { "multipart/form-data": { schema: FIELDS } }),
          "/notes": post("createNote", {
            "text/plain": { schema: FIELDS },
            "application/json": { schema: FIELDS },
          }),
          "/pings": { get: { tags: ["c"], operationId: "ping", responses: { "200": { description: "ok" } } } },
        },
      }),
    );

    expect(mediaTypes(spec)).toEqual({
      createCustomer: "application/x-www-form-urlencoded",
      uploadFile: "multipart/form-data",
      createNote: "application/json",
      ping: undefined,
    });
  });
});

describe("a Swagger 2.0 form", () => {
  function form(consumes: string[] | undefined, fieldType = "string"): ParsedSpec {
    return parseSpec(
      JSON.stringify({
        swagger: "2.0",
        info: { title: "Pets", version: "1" },
        paths: {
          "/pet/{petId}": {
            post: {
              tags: ["pet"],
              operationId: "updatePetWithForm",
              ...(consumes && { consumes }),
              parameters: [
                { name: "petId", in: "path", required: true, type: "integer" },
                { name: "name", in: "formData", type: fieldType },
              ],
              responses: { "200": { description: "ok" } },
            },
          },
        },
      }),
    );
  }

  it("is sent url-encoded when the operation says nothing", () => {
    expect(mediaTypes(form(undefined))).toEqual({
      updatePetWithForm: "application/x-www-form-urlencoded",
    });
  });

  it("takes the form type the operation consumes, not the first type it lists", () => {
    expect(mediaTypes(form(["application/json", "multipart/form-data"]))).toEqual({
      updatePetWithForm: "multipart/form-data",
    });
  });

  it("is multipart when it uploads a file", () => {
    expect(mediaTypes(form(["application/x-www-form-urlencoded"], "file"))).toEqual({
      updatePetWithForm: "multipart/form-data",
    });
  });
});

describe("a Postman body", () => {
  it.each([
    [{ mode: "raw", raw: '{"name":"Ann"}' }, "application/json"],
    [{ mode: "urlencoded", urlencoded: [{ key: "name", value: "Ann" }] }, "application/x-www-form-urlencoded"],
    [{ mode: "formdata", formdata: [{ key: "name", value: "Ann" }] }, "multipart/form-data"],
  ])("keeps the media type its mode sends: %o", (body, mediaType) => {
    const spec = parseSpec(
      JSON.stringify({
        info: { name: "C", schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json" },
        item: [
          { name: "Create user", request: { method: "POST", url: "https://api.example.com/users", body } },
        ],
      }),
    );

    expect(mediaTypes(spec)).toEqual({ createUser: mediaType });
  });
});
