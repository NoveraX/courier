/**
 * Tests for `sanitizeNameMapping` — the whitelist guard applied to every
 * `catalog:names` event arriving from the studio server. Without this, a
 * malformed payload (`{ users: 42 }`) would slip through `renameSourceKeys`
 * and silently mis-rename source keys via implicit string coercion.
 */

import { describe, expect, it } from "vitest";

import { sanitizeNameMapping } from "../src/connect/socket-utils";

describe("sanitizeNameMapping", () => {
  it("returns undefined for null / undefined / non-object", () => {
    expect(sanitizeNameMapping(null)).toBeUndefined();
    expect(sanitizeNameMapping(undefined)).toBeUndefined();
    expect(sanitizeNameMapping("users:apiUsers")).toBeUndefined();
    expect(sanitizeNameMapping(42)).toBeUndefined();
  });

  it("returns undefined for empty object", () => {
    expect(sanitizeNameMapping({})).toBeUndefined();
  });

  it("forwards a fully valid mapping", () => {
    expect(sanitizeNameMapping({ users: "apiUsers", posts: "apiPosts" })).toEqual({
      users: "apiUsers",
      posts: "apiPosts",
    });
  });

  it("drops entries whose value is not a string", () => {
    expect(
      sanitizeNameMapping({
        ok: "renamed",
        numeric: 42,
        nullish: null,
        nested: { x: "y" },
      }),
    ).toEqual({ ok: "renamed" });
  });

  it("drops entries with empty-string values (degenerate rename)", () => {
    expect(sanitizeNameMapping({ users: "" })).toBeUndefined();
  });

  it("returns undefined when every entry is invalid", () => {
    expect(sanitizeNameMapping({ a: 1, b: null, c: false })).toBeUndefined();
  });
});
