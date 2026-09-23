/**
 * Variables written into the query string of a request to the upstream, the
 * way OpenAPI does by default. `String(value)` sent a list as `a,b`, an object
 * as `[object Object]`, and a date in the local format of the calling machine.
 */
import { describe, expect, it } from "vitest";

import { toSearchParams } from "../src/http-client/body-builder";
import { appendQuery, toQueryEntries } from "../src/utils/query-string";

describe("variables sent to the upstream", () => {
  it("repeat the key for each item of a list", () => {
    expect(toSearchParams({ tag: ["a", "b"] })?.toString()).toBe("tag=a&tag=b");
  });

  it("spread an object's fields into keys of their own", () => {
    expect(toSearchParams({ filter: { role: "admin", page: 2 } })?.toString()).toBe(
      "role=admin&page=2",
    );
  });

  it("write a date as an ISO timestamp", () => {
    const at = new Date(Date.UTC(2026, 0, 2, 3, 4, 5));
    expect(toQueryEntries({ since: at })).toEqual([["since", "2026-01-02T03:04:05.000Z"]]);
  });

  it("leave out null as well as undefined", () => {
    expect(toQueryEntries({ a: null, b: undefined, c: 0 })).toEqual([["c", "0"]]);
  });

  it("send what the form style cannot express as JSON", () => {
    expect(toQueryEntries({ rows: [{ id: 1 }] })).toEqual([["rows", '{"id":1}']]);
  });

  it("percent-encode a space in a URL, which a server cannot mistake", () => {
    expect(appendQuery("/s", { q: "a b" })).toBe("/s?q=a%20b");
  });
});
