/**
 * What the generator needs to send a form and read an answer as they are:
 * how each field of a url-encoded body is written — Stripe's `encoding`,
 * Swagger 2.0's `collectionFormat` — and the media type a success answer
 * comes as, though it declares no schema.
 */
import { describe, expect, it } from "vitest";

import { parseSpec } from "../../../src/apis/parser";
import type { ParsedEndpoint, ParsedSpec } from "../../../src/apis/parser/types";

function endpoint(spec: ParsedSpec, name: string): ParsedEndpoint | undefined {
  return spec.groups.flatMap((group) => group.endpoints).find((ep) => ep.name === name);
}

function openApi(paths: Record<string, unknown>): ParsedSpec {
  return parseSpec(JSON.stringify({ openapi: "3.0.3", info: { title: "T", version: "1" }, paths }));
}

describe("a url-encoded body's encoding", () => {
  it("keeps how each field is written, and nothing else of it", () => {
    const spec = openApi({
      "/customers": {
        post: {
          tags: ["c"],
          operationId: "createCustomer",
          requestBody: {
            content: {
              "application/x-www-form-urlencoded": {
                schema: { type: "object", properties: { metadata: { type: "object" } } },
                encoding: {
                  metadata: { style: "deepObject", explode: true },
                  tags: { explode: false },
                  avatar: { contentType: "image/png" },
                  odd: { style: "matrix" },
                },
              },
            },
          },
          responses: { "200": { description: "ok" } },
        },
      },
    });

    expect(endpoint(spec, "createCustomer")?.requestBodyEncoding).toEqual({
      metadata: { style: "deepObject", explode: true },
      tags: { explode: false },
    });
  });

  it("is written for a Swagger 2.0 form's arrays from their collectionFormat, csv when unsaid", () => {
    const array = (name: string, collectionFormat?: string) => ({
      name,
      in: "formData",
      type: "array",
      items: { type: "string" },
      ...(collectionFormat && { collectionFormat }),
    });
    const spec = parseSpec(
      JSON.stringify({
        swagger: "2.0",
        info: { title: "Calls", version: "1" },
        paths: {
          "/calls": {
            post: {
              tags: ["c"],
              operationId: "createCall",
              parameters: [
                array("events", "multi"),
                array("ids"),
                array("words", "ssv"),
                array("pipes", "pipes"),
              ],
              responses: { "200": { description: "ok" } },
            },
          },
        },
      }),
    );
    const call = endpoint(spec, "createCall");

    expect(call?.requestBodyEncoding).toEqual({
      events: { style: "form", explode: true },
      ids: { style: "form", explode: false },
      words: { style: "spaceDelimited", explode: false },
      pipes: { style: "pipeDelimited", explode: false },
    });
    expect(call?.requestBody?.properties?.events).toMatchObject({
      type: "array",
      items: { type: "string" },
    });
  });
});

describe("a success answer's media type", () => {
  const get = (operationId: string, content: Record<string, unknown>) => ({
    get: { tags: ["r"], operationId, responses: { "200": { description: "ok", content } } },
  });

  it("is the one its schema is written under, JSON first, or the first declared without one", () => {
    const spec = openApi({
      "/csv": get("exportCsv", { "text/csv": {} }),
      "/pdf": get("renderPdf", {
        "application/pdf": { schema: { type: "string", format: "binary" } },
      }),
      "/both": get("either", {
        "text/plain": { schema: { type: "string" } },
        "application/json": { schema: { type: "object" } },
      }),
      "/none": {
        get: { tags: ["r"], operationId: "noBody", responses: { "204": { description: "gone" } } },
      },
    });

    expect(endpoint(spec, "exportCsv")).toMatchObject({
      responseSchema: null,
      responseMediaType: "text/csv",
    });
    expect(endpoint(spec, "renderPdf")?.responseMediaType).toBe("application/pdf");
    expect(endpoint(spec, "either")?.responseMediaType).toBe("application/json");
    expect(endpoint(spec, "noBody")?.responseMediaType).toBeUndefined();
  });
});
