/**
 * The name each source's routes are exported under: the source's name and
 * `Routes`, its words joined as one identifier — and no two sources under
 * one name.
 */
import { describe, expect, it } from "vitest";

import { nameRoutes } from "../../src/routes-module/name-routes";

function routesOf(...sources: string[]) {
  return sources.map((source) => ({ source, endpoints: {} }));
}

describe("nameRoutes", () => {
  it("names a source's routes by the source, its words joined as one identifier", () => {
    const { named } = nameRoutes(routesOf("api", "my-api", "billing.v2", "$web", "2fa"));

    expect(named?.map((each) => each.exportName)).toEqual([
      "apiRoutes",
      "myApiRoutes",
      "billingV2Routes",
      "$webRoutes",
      "_2faRoutes",
    ]);
  });

  it("refuses two sources whose routes would take one name", () => {
    expect(nameRoutes(routesOf("my-api", "myApi"))).toEqual({
      named: null,
      problem:
        'the sources "my-api" and "myApi" would both be exported as myApiRoutes; rename one of them',
    });
  });

  it("refuses a source whose name holds no word to name its routes by", () => {
    expect(nameRoutes(routesOf("--")).problem).toBe(
      'the source "--" has no name to export its routes under',
    );
  });
});
