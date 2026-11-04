/**
 * The boundary a multipart body's Content-Type names, read as RFC 9110
 * parameters and held to RFC 2046's rules for a boundary.
 */
import { describe, expect, it } from "vitest";

import { boundaryOf } from "../../src/adapter/multipart/boundary-of";

describe("boundaryOf", () => {
  it.each([
    ["multipart/form-data; boundary=----WebKitFormBoundaryA1b2", "----WebKitFormBoundaryA1b2"],
    ['multipart/form-data; boundary="with space:and=more"', "with space:and=more"],
    ['multipart/form-data; note="a;boundary=evil"; boundary=real', "real"],
    ["multipart/form-data;charset=utf-8;BOUNDARY=x", "x"],
    ['multipart/form-data; xboundary=no; boundary="yes"', "yes"],
    [`multipart/form-data; boundary=${"a".repeat(70)}`, "a".repeat(70)],
  ])("reads %j", (contentType, boundary) => {
    expect(boundaryOf(contentType)).toBe(boundary);
  });

  it.each([
    ["no boundary", "multipart/form-data"],
    ["an empty one", "multipart/form-data; boundary="],
    ["one too long", `multipart/form-data; boundary=${"a".repeat(71)}`],
    ["one ending in a space", 'multipart/form-data; boundary="ends "'],
    ["one with a character RFC 2046 leaves out", 'multipart/form-data; boundary="a@b"'],
    ["one with a semicolon in its quotes", 'multipart/form-data; boundary="a;b"'],
    ["a quote left open", 'multipart/form-data; boundary="open'],
  ])("refuses %s", (_case, contentType) => {
    expect(() => boundaryOf(contentType)).toThrow(
      expect.objectContaining({ code: "BODY_MALFORMED", status: 400 }),
    );
  });
});
