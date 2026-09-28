import { describe, expect, it } from "vitest";
import { filterHeaders, mergeHeaders } from "../src/utils/merge-headers";

describe("filterHeaders", () => {
  it("returns empty Headers when no input", () => {
    const result = filterHeaders();
    expect([...result.entries()]).toEqual([]);
  });

  it("filters headers by whitelist", () => {
    const incoming = new Headers({
      authorization: "Bearer token",
      "content-type": "application/json",
      "x-custom": "value",
    });
    const result = filterHeaders(incoming);
    expect(result.get("authorization")).toBe("Bearer token");
    expect(result.has("content-type")).toBe(false);
    expect(result.has("x-custom")).toBe(false);
  });

  /** Header names are case-insensitive, and the docs spell them `X-Custom`. */
  it("matches a name the allowlist spells in capitals", () => {
    const incoming = new Headers({ "x-custom": "value" });

    const result = filterHeaders(incoming, ["X-Custom"]);

    expect(result.get("x-custom")).toBe("value");
  });

  it("passes all whitelisted headers", () => {
    const incoming = new Headers({
      authorization: "Bearer token",
      cookie: "session=abc",
      referer: "https://example.com",
      origin: "https://example.com",
      "user-agent": "test",
      "x-request-id": "abc-123",
    });
    const result = filterHeaders(incoming);
    expect(result.get("authorization")).toBe("Bearer token");
    expect(result.get("cookie")).toBe("session=abc");
    expect(result.get("referer")).toBe("https://example.com");
    expect(result.get("origin")).toBe("https://example.com");
    expect(result.get("user-agent")).toBe("test");
    expect(result.get("x-request-id")).toBe("abc-123");
  });

  it("does not pass a client address the caller wrote itself", () => {
    const incoming = new Headers({
      "x-forwarded-for": "1.2.3.4",
      "x-real-ip": "1.2.3.4",
      forwarded: "for=1.2.3.4",
      "x-client-ip": "1.2.3.4",
    });

    expect([...filterHeaders(incoming).keys()]).toEqual([]);
  });

  it("extends whitelist with validHeaders", () => {
    const incoming = new Headers({ "x-custom-header": "value" });
    const result = filterHeaders(incoming, ["x-custom-header"]);
    expect(result.get("x-custom-header")).toBe("value");
  });

  it("accepts Record input", () => {
    const result = filterHeaders({ authorization: "Bearer token", "x-bad": "drop" });
    expect(result.get("authorization")).toBe("Bearer token");
    expect(result.has("x-bad")).toBe(false);
  });

  it("accepts array tuple input", () => {
    const result = filterHeaders([["authorization", "Bearer token"]]);
    expect(result.get("authorization")).toBe("Bearer token");
  });

  it("is case-insensitive", () => {
    const result = filterHeaders({ Authorization: "Bearer token" });
    expect(result.get("authorization")).toBe("Bearer token");
  });
});

describe("mergeHeaders", () => {
  it("returns base headers when no request headers", () => {
    const result = mergeHeaders({ "content-type": "application/json" });
    expect(result.get("content-type")).toBe("application/json");
  });

  it("merges base and filtered request headers", () => {
    const result = mergeHeaders(
      { "content-type": "application/json" },
      { authorization: "Bearer token", "x-bad": "drop" },
    );
    expect(result.get("content-type")).toBe("application/json");
    expect(result.get("authorization")).toBe("Bearer token");
    expect(result.has("x-bad")).toBe(false);
  });

  it("request headers override base headers for same key", () => {
    const result = mergeHeaders({ authorization: "old" }, { authorization: "new" });
    expect(result.get("authorization")).toBe("new");
  });

  it("uses validHeaders to extend whitelist", () => {
    const result = mergeHeaders({}, { "x-custom": "value" }, ["x-custom"]);
    expect(result.get("x-custom")).toBe("value");
  });

  it("handles empty inputs", () => {
    const result = mergeHeaders();
    expect([...result.entries()]).toEqual([]);
  });

  it("does not mutate input Headers", () => {
    const original = new Headers({ "content-type": "text/plain" });
    mergeHeaders(original, { authorization: "token" });
    expect(original.has("authorization")).toBe(false);
  });
});
