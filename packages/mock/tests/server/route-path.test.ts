/**
 * The route a mock serves a declared path at, in Hono's terms: text and a
 * parameter alone as written, and a segment Hono cannot read as either —
 * a parameter beside text, text that starts with a colon — by a pattern of
 * its own, its parameters split out of the value the request gave it.
 */
import { describe, expect, it } from "vitest";

import { routePath } from "../../src/server/route-path";

describe("routePath", () => {
  it("routes text and a parameter alone as written", () => {
    const { route, params } = routePath("users/:id/orders");

    expect(route).toBe("/users/:id/orders");
    expect(params({ id: "7" })).toEqual({ id: "7" });
  });

  it("routes text with a colon inside it as text", () => {
    expect(routePath("v1/urlInspection/index::inspect").route).toBe(
      "/v1/urlInspection/index:inspect",
    );
  });

  it("routes text that starts with a colon by a pattern, which takes no parameter", () => {
    const { route, params } = routePath("v1/::batchGet");

    expect(route.startsWith("/v1/:courier-segment-1{")).toBe(true);
    expect(params({ "courier-segment-1": ":batchGet" })).toEqual({});
  });

  it("routes a parameter beside text by a pattern, and splits its value out", () => {
    const { route, params } = routePath("v4/spreadsheets/:spreadsheetId::batchUpdate/:sheet");

    expect(route.startsWith("/v4/spreadsheets/:courier-segment-2{")).toBe(true);
    expect(route.endsWith("}/:sheet")).toBe(true);
    expect(params({ "courier-segment-2": "s1:batchUpdate", sheet: "9" })).toEqual({
      spreadsheetId: "s1",
      sheet: "9",
    });
  });

  it("routes a path with no segment at the root", () => {
    expect(routePath("").route).toBe("/");
    expect(routePath("/").route).toBe("/");
  });
});
