/**
 * How a generated endpoint reads its answer, from the media type it comes as.
 */
import { describe, expect, it } from "vitest";

import { responseReading } from "../../src/apis/generator/response-reading";
import type { ParsedEndpoint } from "../../src/apis/parser/types";

function reading(responseMediaType?: string) {
  const ep: ParsedEndpoint = {
    name: "e",
    operationId: null,
    httpMethod: "get",
    path: "/e",
    fullPath: "/e",
    description: "",
    secured: false,
    requestBody: null,
    parameters: [],
    responseSchema: null,
    tags: [],
    ...(responseMediaType && { responseMediaType }),
  };
  return responseReading(ep);
}

describe("responseReading", () => {
  it("reads JSON, a JSON variant, a wildcard and no media type at all as JSON", () => {
    for (const media of [undefined, "application/json", "application/problem+json", "*/*", "application/*"]) {
      expect(reading(media)).toBe("json");
    }
  });

  it("reads text, XML, YAML, CSV, a form and JSON lines as text", () => {
    for (const media of ["text/plain", "text/csv; charset=utf-8", "application/xml", "application/x-yaml", "application/csv", "application/x-www-form-urlencoded", "application/x-ndjson"]) {
      expect(reading(media)).toBe("text");
    }
  });

  it("reads anything else as a blob", () => {
    for (const media of ["application/pdf", "image/png", "application/octet-stream", "application/zip"]) {
      expect(reading(media)).toBe("blob");
    }
  });

  it("leaves a stream of events to be read as a stream", () => {
    expect(reading("text/event-stream")).toBe("json");
  });
});
