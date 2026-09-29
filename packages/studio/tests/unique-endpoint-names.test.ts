import { describe, expect, it } from "vitest";

import { parseSpec } from "../src/apis/parser";
import type { ParsedEndpoint } from "../src/apis/parser/types";
import { uniqueEndpointNames } from "../src/apis/parser/unique-endpoint-names";

function endpoint(over: Partial<ParsedEndpoint>): ParsedEndpoint {
  return {
    name: "getById",
    operationId: null,
    httpMethod: "get",
    path: "/",
    fullPath: "/v2/things/{id}",
    description: "",
    secured: false,
    requestBody: null,
    parameters: [],
    responseSchema: null,
    tags: [],
    ...over,
  } as ParsedEndpoint;
}

/** A specification that tags nothing and names nothing — DigitalOcean's shape. */
function untaggedSpec(paths: Record<string, Record<string, unknown>>): string {
  return JSON.stringify({
    openapi: "3.0.0",
    info: { title: "Untagged", version: "1.0.0" },
    paths,
  });
}

const ok = { responses: { "200": { description: "ok" } } };

describe("uniqueEndpointNames", () => {
  it("leaves a name that nothing else claims", () => {
    const result = uniqueEndpointNames([
      endpoint({ name: "getById" }),
      endpoint({ name: "create", httpMethod: "post" }),
    ]);

    expect(result.map((e) => e.name)).toEqual(["getById", "create"]);
  });

  it("rebuilds colliding names from the path they serve", () => {
    const result = uniqueEndpointNames(
      [
        endpoint({ name: "getById", fullPath: "/v2/account/keys/{id}" }),
        endpoint({ name: "getById", fullPath: "/v2/actions/{id}" }),
      ],
      "/v2",
    );

    expect(result.map((e) => e.name)).toEqual(["getAccountKeysById", "getActionsById"]);
  });

  it("keeps a collection apart from a single item on the same resource", () => {
    const result = uniqueEndpointNames([
      endpoint({ name: "getAll", fullPath: "/keys" }),
      endpoint({ name: "getAll", fullPath: "/keys/{id}" }),
    ]);

    expect(new Set(result.map((e) => e.name)).size).toBe(2);
  });

  it("falls back to a number when the path cannot tell them apart", () => {
    const result = uniqueEndpointNames([
      endpoint({ name: "getById", fullPath: "/things/{a}" }),
      endpoint({ name: "getById", fullPath: "/things/{b}" }),
    ]);

    expect(new Set(result.map((e) => e.name)).size).toBe(2);
  });
});

describe("a specification with neither tags nor operation ids", () => {
  it("gives every endpoint of the single group its own name", () => {
    const spec = parseSpec(
      untaggedSpec({
        "/v2/account/keys": { get: ok, post: ok },
        "/v2/account/keys/{id}": { get: ok, put: ok, delete: ok },
        "/v2/actions": { get: ok },
        "/v2/actions/{id}": { get: ok },
        "/v2/droplets/{id}": { get: ok, delete: ok },
      }),
    );

    const names = spec.groups.flatMap((g) => g.endpoints.map((e) => e.name));

    expect(names).toHaveLength(9);
    expect(new Set(names).size).toBe(9);
  });

  it("does not disturb a specification whose names were already unique", () => {
    const spec = parseSpec(
      JSON.stringify({
        openapi: "3.0.0",
        info: { title: "Tagged", version: "1.0.0" },
        paths: {
          "/pets": { get: { operationId: "listPets", tags: ["pets"], ...ok } },
          "/pets/{id}": { get: { operationId: "getPet", tags: ["pets"], ...ok } },
        },
      }),
    );

    expect(spec.groups[0]?.endpoints.map((e) => e.name)).toEqual(["listPets", "getPet"]);
  });
});
