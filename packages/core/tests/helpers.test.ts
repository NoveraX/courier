import { describe, expect, it } from "vitest";
import {
  headersToObject,
  isFormData,
  isHeaders,
  parseEndpointKey,
  parseRequestPayload,
} from "../src/utils/helpers";

describe("parseEndpointKey", () => {
  it("parses simple method (no group)", () => {
    expect(parseEndpointKey("list")).toEqual({ group: undefined, method: "list" });
  });

  it("parses group:method format", () => {
    expect(parseEndpointKey("auth:login")).toEqual({ group: "auth", method: "login" });
  });

  it("handles empty string", () => {
    expect(parseEndpointKey("")).toEqual({ group: undefined, method: "" });
  });
});

describe("parseRequestPayload", () => {
  it("extracts fields from plain object", () => {
    const result = parseRequestPayload({
      source: "users",
      group: "auth",
      method: "login",
      variables: { email: "test@test.com" },
    });
    expect(result.source).toBe("users");
    expect(result.group).toBe("auth");
    expect(result.method).toBe("login");
    expect(result.variables).toEqual({ email: "test@test.com" });
  });

  it("handles undefined input", () => {
    const result = parseRequestPayload(undefined);
    expect(result.source).toBeUndefined();
    expect(result.method).toBeUndefined();
  });
});

describe("headersToObject", () => {
  it("returns undefined for no headers", () => {
    expect(headersToObject()).toBeUndefined();
  });

  it("converts Headers to plain object", () => {
    const h = new Headers({ "content-type": "application/json", authorization: "Bearer xxx" });
    expect(headersToObject(h)).toEqual({
      "content-type": "application/json",
      authorization: "Bearer xxx",
    });
  });
});

describe("isFormData", () => {
  it("returns true for FormData", () => {
    expect(isFormData(new FormData())).toBe(true);
  });

  it("returns false for plain object", () => {
    expect(isFormData({})).toBe(false);
  });

  it("returns false for null/undefined", () => {
    expect(isFormData(null)).toBe(false);
    expect(isFormData(undefined)).toBe(false);
  });
});

describe("isHeaders", () => {
  it("returns true for Headers", () => {
    expect(isHeaders(new Headers())).toBe(true);
  });

  it("returns false for plain object", () => {
    expect(isHeaders({})).toBe(false);
  });

  it("returns false for null", () => {
    expect(isHeaders(null)).toBe(false);
  });
});
