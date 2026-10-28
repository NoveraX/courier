/**
 * `@noverax/courier/routes` as the package ships it, where no bundler
 * plugin built the routes in its place. It holds no routes: reading one
 * refuses with `ROUTES_NOT_BUILT` and says how to build them, so a page
 * never runs on routes nobody built. The reads tools make of any value — a
 * promise check, JSON, a test matcher — get nothing rather than a throw.
 */
import { describe, expect, it } from "vitest";

import { ConfigurationError } from "../src/errors";
import { routes } from "../src/routes";

describe("the routes module the package ships", () => {
  it("refuses a read of a route, saying how to build the routes", () => {
    const read = () => Reflect.get(routes, "shop");

    expect(read).toThrow(ConfigurationError);
    expect(read).toThrow(expect.objectContaining({ code: "ROUTES_NOT_BUILT" }));
    expect(read).toThrow(/routes\.shop was read.*plugin.*courier-cli routes/s);
  });

  it("answers the reads tools make of any value with nothing", async () => {
    await expect(Promise.resolve(routes)).resolves.toBe(routes);
    expect(JSON.stringify(routes)).toBe("{}");
    expect(Object.keys(routes)).toEqual([]);
    expect(Reflect.get(routes, Symbol.toPrimitive)).toBeUndefined();
  });

  it("answers what every object has as any object does", () => {
    expect(String(routes)).toBe("[object Object]");
    expect(Object.hasOwn(routes, "shop")).toBe(false);
    expect(routes.constructor).toBe(Object);
  });
});
