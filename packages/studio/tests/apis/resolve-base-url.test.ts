/**
 * A specification read from a URL calls the server it names — made
 * absolute against that URL when the spec names it relative to itself, as
 * OpenAPI allows, or names none.
 */
import { describe, expect, it } from "vitest";
import type { ParsedSpec } from "../../src/apis/parser/types";
import { resolveBaseURL } from "../../src/apis/resolve-base-url";
import { readFetchedSpec } from "../../src/server/read-fetched-spec";

const SPEC: ParsedSpec = {
  title: "Pets",
  version: "1",
  description: "",
  baseURL: "/api/v3",
  format: "openapi3",
  groups: [],
  schemas: {},
  securitySchemes: [],
  skipped: [],
};

const URL_OF_SPEC = "https://petstore3.swagger.io/api/v3/openapi.json";

describe("the server a specification read from a URL calls", () => {
  it("is resolved against that URL when the spec names it relative to itself", () => {
    expect(resolveBaseURL(SPEC, URL_OF_SPEC).baseURL).toBe("https://petstore3.swagger.io/api/v3");
    expect(resolveBaseURL({ ...SPEC, baseURL: "../v2" }, URL_OF_SPEC).baseURL).toBe(
      "https://petstore3.swagger.io/api/v2",
    );
  });

  it("is the document's own origin when the spec names no server", () => {
    expect(resolveBaseURL({ ...SPEC, baseURL: "/" }, URL_OF_SPEC).baseURL).toBe(
      "https://petstore3.swagger.io",
    );
  });

  it("stays as the spec names it when it is absolute already", () => {
    const absolute = { ...SPEC, baseURL: "https://api.example.com/v1" };

    expect(resolveBaseURL(absolute, URL_OF_SPEC)).toBe(absolute);
  });

  it("is resolved for a specification Studio fetches again, as the update check does", async () => {
    const raw = JSON.stringify({
      openapi: "3.0.3",
      info: { title: "Pets", version: "1" },
      servers: [{ url: "/api/v3" }],
      paths: {},
    });

    expect((await readFetchedSpec(URL_OF_SPEC, raw)).spec().baseURL).toBe(
      "https://petstore3.swagger.io/api/v3",
    );
  });
});
