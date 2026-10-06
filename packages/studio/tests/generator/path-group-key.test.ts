/**
 * Grouped by path, an endpoint goes in the group its first resource names:
 * past the segments every path shares above every operation, a version and
 * a parameter. A path with no such segment sits in the API itself.
 */
import { describe, expect, it } from "vitest";

import { placeEndpoints } from "../../src/apis/generator/endpoint-placements";
import { pathGroupKey, sharedRoot } from "../../src/apis/generator/path-group-key";
import { parseSpec } from "../../src/apis/parser";

const ok = { responses: { "200": { description: "ok" } } };

function placedBy(paths: string[]): Record<string, string[]> {
  const spec = parseSpec(
    JSON.stringify({
      openapi: "3.1.0",
      info: { title: "API", version: "1" },
      paths: Object.fromEntries(paths.map((path) => [path, { get: ok }])),
    }),
  );
  const groups: Record<string, string[]> = {};
  for (const { group, endpoint } of placeEndpoints(spec, "path")) {
    groups[group.name] = [...(groups[group.name] ?? []), endpoint.path];
  }
  return groups;
}

describe("sharedRoot", () => {
  it("counts the segments every path shares above every operation", () => {
    expect(sharedRoot(["/v1/customers", "/v1/charges/{charge}"])).toBe(1);
    expect(sharedRoot(["/api/v2/users", "/api/v2/orders/{id}/lines"])).toBe(2);
  });

  it("stops at a parameter, and at a segment an operation is declared at", () => {
    expect(sharedRoot(["/{owner}/repos", "/{owner}/gists"])).toBe(0);
    expect(sharedRoot(["/settings", "/settings/list"])).toBe(0);
    expect(sharedRoot(["/v1/customers"])).toBe(1);
  });

  it("reads a path without the query some specifications write into its key", () => {
    expect(sharedRoot(["/responses?beta=true", "/responses/{id}?beta=true"])).toBe(0);
  });
});

describe("pathGroupKey", () => {
  it("takes the first segment after the root that names neither a parameter nor a version", () => {
    expect(pathGroupKey("/v1/customers/{customer}", 1)).toBe("customers");
    expect(pathGroupKey("/{owner}/v2beta1/repos", 0)).toBe("repos");
    expect(pathGroupKey("/2010-04-01/Accounts/{sid}/Calls.json", 0)).toBe("Accounts");
    expect(pathGroupKey("/1.1/statuses", 0)).toBe("statuses");
    expect(pathGroupKey("/2/tweets", 0)).toBe("tweets");
    expect(pathGroupKey("/responses?beta=true", 0)).toBe("responses");
  });

  it("finds none for the API's root, a version alone, or parameters alone", () => {
    expect(pathGroupKey("/", 0)).toBeNull();
    expect(pathGroupKey("/v1", 0)).toBeNull();
    expect(pathGroupKey("/v1/customers", 2)).toBeNull();
    expect(pathGroupKey("/{id}", 0)).toBeNull();
  });
});

describe("grouping a specification by path", () => {
  it("groups Stripe's resources past the version every path starts with", () => {
    expect(placedBy(["/v1/customers", "/v1/customers/{customer}", "/v1/charges"])).toEqual({
      customers: ["/", "/:customer"],
      charges: ["/charges"],
    });
  });

  it("puts a path no segment groups in the API itself, at its whole path", () => {
    expect(placedBy(["/", "/v2", "/users", "/users/{id}"])).toEqual({
      "": ["/", "/v2"],
      users: ["/", "/:id"],
    });
  });

  it("keeps a resource every path is under as the group, when an operation is declared at it", () => {
    expect(placedBy(["/settings", "/settings/options", "/settings/list"])).toEqual({
      settings: ["/", "/options", "/list"],
    });
  });

  it("joins a path holding a query in its key to the resource it names", () => {
    expect(Object.keys(placedBy(["/responses", "/responses?beta=true", "/models"]))).toEqual([
      "responses",
      "models",
    ]);
  });
});
