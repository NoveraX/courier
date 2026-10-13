import { describe, expect, it } from "vitest";

import { canonicalRoute, DECODING_PASSES, LONGEST_ROUTE_PATH } from "../src/server/canonical-route";

/* `/a`, its escape escaped `levels` times over: `%61`, `%2561`, `%252561`… */
function escapedOver(levels: number): string {
  return `/%${"25".repeat(levels - 1)}61`;
}

describe("canonicalRoute", () => {
  it.each([
    ["/api/sessions/save", "/api/sessions/save"],
    ["/api/sessions/save/", "/api/sessions/save"],
    ["/api/sessions/save///", "/api/sessions/save"],
    ["/API/SESSIONS/SAVE", "/api/sessions/save"],
    ["/api//sessions//save", "/api/sessions/save"],
    ["//api/sessions/save", "/api/sessions/save"],
    ["/api/./sessions/save", "/api/sessions/save"],
    ["/api/x/../sessions/save", "/api/sessions/save"],
    ["/api/sessions/%73ave", "/api/sessions/save"],
    ["/api/sessions/%2573ave", "/api/sessions/save"],
    ["/api/sessions%2Fsave", "/api/sessions/save"],
    ["/api/%2e/sessions/%2E%2E/sessions/save", "/api/sessions/save"],
    ["/api\\sessions\\save", "/api/sessions/save"],
  ])("reads %s as %s", (path, route) => {
    expect(canonicalRoute(path)).toBe(route);
  });

  it("keeps a climb past the root at the root", () => {
    expect(canonicalRoute("/../../api/storage/compact")).toBe("/api/storage/compact");
  });

  it("leaves an escape of a character outside ASCII as it is", () => {
    expect(canonicalRoute("/api/caf%C3%A9")).toBe("/api/caf%c3%a9");
  });

  it("reads the root as the root", () => {
    expect(canonicalRoute("/")).toBe("/");
    expect(canonicalRoute("")).toBe("/");
  });
});

describe("canonicalRoute's bounds", () => {
  it("decodes a path escaped as many times over as it takes passes", () => {
    expect(DECODING_PASSES).toBe(3);
    expect(canonicalRoute(escapedOver(DECODING_PASSES))).toBe("/a");
    expect(canonicalRoute("/api/sessions/%252573ave")).toBe("/api/sessions/save");
  });

  it("reads no route in a path escaped once more than that", () => {
    expect(canonicalRoute(escapedOver(DECODING_PASSES + 1))).toBeUndefined();
    expect(canonicalRoute("/api/sessions/%25252573ave")).toBeUndefined();
  });

  it("stops after its passes however deep the escapes go, rather than decoding to the end", () => {
    const deepest = escapedOver((LONGEST_ROUTE_PATH - 4) / 2);

    expect(deepest.length).toBeLessThanOrEqual(LONGEST_ROUTE_PATH);
    expect(canonicalRoute(deepest)).toBeUndefined();
  });

  it("reads no route in a path longer than any it has", () => {
    const longest = `/${"a".repeat(LONGEST_ROUTE_PATH - 1)}`;

    expect(canonicalRoute(longest)).toBe(longest);
    expect(canonicalRoute(`${longest}a`)).toBeUndefined();
    expect(canonicalRoute(`/api/${"x/../".repeat(512)}sessions/save`)).toBeUndefined();
  });

  it("reads a path of 64 KB of escapes within escapes at once", () => {
    const pathological = escapedOver(32 * 1024);
    const begun = performance.now();

    for (let n = 0; n < 10; n++) expect(canonicalRoute(pathological)).toBeUndefined();

    /* Decoded to the end, each took nearly half a second. */
    expect(pathological.length).toBeGreaterThan(64_000);
    expect(performance.now() - begun).toBeLessThan(1_000);
  });
});
