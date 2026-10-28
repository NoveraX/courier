/**
 * A page's proxy client is made from the routes of one API. Handed anything
 * else — `undefined` for a source the routes do not hold, a module that
 * exports none — it refuses with `ROUTES_INVALID` and says what it takes,
 * rather than failing deeper in with a `TypeError` that names neither.
 */
import { describe, expect, it } from "vitest";

import { ConfigurationError } from "../src/errors";
import { createProxyCaller } from "../src/proxy-caller";
import { assertRoutes } from "../src/proxy-caller/assert-routes";

describe("assertRoutes", () => {
  it("passes the routes of one API", () => {
    expect(() =>
      assertRoutes({ source: "shop", endpoints: {} }, "createProxyCaller"),
    ).not.toThrow();
  });

  it.each([
    [undefined, "undefined"],
    [null, "null"],
    [[], "a list"],
    ["shop", "a string"],
    [{ source: "shop" }, "an object with no source and endpoints"],
  ])("refuses %j, saying it was handed %s", (handed, described) => {
    const make = () => assertRoutes(handed, "createProxyCaller");

    expect(make).toThrow(ConfigurationError);
    expect(make).toThrow(expect.objectContaining({ code: "ROUTES_INVALID" }));
    expect(make).toThrow(`createProxyCaller() takes the routes of one API`);
    expect(make).toThrow(`was handed ${described}.`);
  });
});

describe("createProxyCaller", () => {
  it("refuses a source the routes do not hold, naming what it takes", () => {
    const routes: Record<string, never> = {};

    expect(() => createProxyCaller(routes.shop as never)).toThrow(
      expect.objectContaining({ code: "ROUTES_INVALID" }),
    );
  });
});
