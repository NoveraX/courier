import { describe, expect, it } from "vitest";
import {
  sanitizeRuntimeAnnounce,
  sanitizeRuntimeHello,
} from "../src/server/sanitize-runtime-events";

describe("sanitizeRuntimeHello", () => {
  it("accepts a well-formed payload", () => {
    expect(sanitizeRuntimeHello({ runtimeId: "next-server", kind: "server" })).toEqual({
      runtimeId: "next-server",
      kind: "server",
    });
  });

  it("accepts the browser kind", () => {
    expect(sanitizeRuntimeHello({ runtimeId: "next-browser", kind: "browser" })).toEqual({
      runtimeId: "next-browser",
      kind: "browser",
    });
  });

  it("rejects empty runtimeId", () => {
    expect(sanitizeRuntimeHello({ runtimeId: "", kind: "server" })).toBeUndefined();
  });

  it("rejects unknown kind", () => {
    expect(sanitizeRuntimeHello({ runtimeId: "x", kind: "edge" })).toBeUndefined();
  });

  it("rejects non-object root", () => {
    expect(sanitizeRuntimeHello(null)).toBeUndefined();
    expect(sanitizeRuntimeHello("foo")).toBeUndefined();
    expect(sanitizeRuntimeHello([])).toBeUndefined();
  });

  it("rejects objects with non-Object prototype", () => {
    const malicious = Object.create({ polluted: true });
    malicious.runtimeId = "x";
    malicious.kind = "server";
    expect(sanitizeRuntimeHello(malicious)).toBeUndefined();
  });

  it("rejects runtimeId with disallowed characters", () => {
    expect(sanitizeRuntimeHello({ runtimeId: "next browser", kind: "browser" })).toBeUndefined();
    expect(sanitizeRuntimeHello({ runtimeId: "next/browser", kind: "browser" })).toBeUndefined();
    expect(sanitizeRuntimeHello({ runtimeId: "next.browser", kind: "browser" })).toBeUndefined();
  });

  it("rejects runtimeId longer than 256 chars", () => {
    expect(
      sanitizeRuntimeHello({ runtimeId: "a".repeat(257), kind: "browser" }),
    ).toBeUndefined();
  });

  it("accepts an http listenOrigin", () => {
    expect(
      sanitizeRuntimeHello({
        runtimeId: "next-server",
        kind: "server",
        listenOrigin: "http://localhost:3000",
      }),
    ).toEqual({
      runtimeId: "next-server",
      kind: "server",
      listenOrigin: "http://localhost:3000",
    });
  });

  it("accepts an https listenOrigin", () => {
    expect(
      sanitizeRuntimeHello({
        runtimeId: "next-server",
        kind: "server",
        listenOrigin: "https://app.example.com",
      })?.listenOrigin,
    ).toBe("https://app.example.com");
  });

  it("drops unsafe listenOrigin schemes", () => {
    const result = sanitizeRuntimeHello({
      runtimeId: "x",
      kind: "server",
      listenOrigin: "javascript:alert(1)",
    });
    expect(result).toEqual({ runtimeId: "x", kind: "server" });
  });

  it("drops non-string listenOrigin", () => {
    const result = sanitizeRuntimeHello({
      runtimeId: "x",
      kind: "server",
      listenOrigin: 1234,
    });
    expect(result).toEqual({ runtimeId: "x", kind: "server" });
  });

  it("accepts a 16-char hex sourcesHash", () => {
    expect(
      sanitizeRuntimeHello({
        runtimeId: "x",
        kind: "server",
        sourcesHash: "a1b2c3d4e5f60718",
      })?.sourcesHash,
    ).toBe("a1b2c3d4e5f60718");
  });

  it("drops sourcesHash with wrong length", () => {
    const result = sanitizeRuntimeHello({
      runtimeId: "x",
      kind: "server",
      sourcesHash: "deadbeef",
    });
    expect(result).toEqual({ runtimeId: "x", kind: "server" });
  });

  it("drops sourcesHash with non-hex characters", () => {
    const result = sanitizeRuntimeHello({
      runtimeId: "x",
      kind: "server",
      sourcesHash: "ZZZZZZZZZZZZZZZZ",
    });
    expect(result).toEqual({ runtimeId: "x", kind: "server" });
  });

  it("drops uppercase hex sourcesHash (lowercase-only contract)", () => {
    const result = sanitizeRuntimeHello({
      runtimeId: "x",
      kind: "server",
      sourcesHash: "A1B2C3D4E5F60718",
    });
    expect(result).toEqual({ runtimeId: "x", kind: "server" });
  });

  it("accepts both optional fields together", () => {
    expect(
      sanitizeRuntimeHello({
        runtimeId: "next-server",
        kind: "server",
        listenOrigin: "http://localhost:4000",
        sourcesHash: "0011223344556677",
      }),
    ).toEqual({
      runtimeId: "next-server",
      kind: "server",
      listenOrigin: "http://localhost:4000",
      sourcesHash: "0011223344556677",
    });
  });
});

describe("sanitizeRuntimeAnnounce", () => {
  it("normalizes a well-formed payload", () => {
    expect(
      sanitizeRuntimeAnnounce({ transports: ["http", "sse"], sources: ["users", "orders"] }),
    ).toEqual({ transports: ["http", "sse"], sources: ["users", "orders"] });
  });

  it("drops unknown transports", () => {
    const result = sanitizeRuntimeAnnounce({
      transports: ["http", "graphql", "ws"],
      sources: ["api"],
    });
    expect(result).toEqual({ transports: ["http", "ws"], sources: ["api"] });
  });

  it("drops empty source names and dedupes", () => {
    const result = sanitizeRuntimeAnnounce({
      transports: ["http", "http"],
      sources: ["api", "", "api", "users"],
    });
    expect(result).toEqual({ transports: ["http"], sources: ["api", "users"] });
  });

  it("returns empty arrays for an entirely empty announce", () => {
    expect(sanitizeRuntimeAnnounce({ transports: [], sources: [] })).toEqual({
      transports: [],
      sources: [],
    });
  });

  it("rejects non-array transports", () => {
    expect(
      sanitizeRuntimeAnnounce({ transports: "http", sources: ["api"] }),
    ).toBeUndefined();
  });

  it("rejects non-object root", () => {
    expect(sanitizeRuntimeAnnounce(null)).toBeUndefined();
    expect(sanitizeRuntimeAnnounce([])).toBeUndefined();
  });

  it("accepts a safe http listenOrigin", () => {
    expect(
      sanitizeRuntimeAnnounce({
        transports: ["http"],
        sources: ["api"],
        listenOrigin: "http://localhost:3000",
      }),
    ).toEqual({
      transports: ["http"],
      sources: ["api"],
      listenOrigin: "http://localhost:3000",
    });
  });

  it("accepts a safe https listenOrigin", () => {
    expect(
      sanitizeRuntimeAnnounce({
        transports: ["sse"],
        sources: ["api"],
        listenOrigin: "https://api.example.com",
      })?.listenOrigin,
    ).toBe("https://api.example.com");
  });

  it("drops unsafe listenOrigin schemes", () => {
    const result = sanitizeRuntimeAnnounce({
      transports: ["http"],
      sources: ["api"],
      listenOrigin: "javascript:alert(1)",
    });
    expect(result).toEqual({ transports: ["http"], sources: ["api"] });
  });

  it("drops non-string listenOrigin", () => {
    const result = sanitizeRuntimeAnnounce({
      transports: ["http"],
      sources: ["api"],
      listenOrigin: 1234,
    });
    expect(result).toEqual({ transports: ["http"], sources: ["api"] });
  });

  it("accepts a framework brand string", () => {
    expect(
      sanitizeRuntimeAnnounce({
        transports: ["http"],
        sources: ["api"],
        framework: "next",
      })?.framework,
    ).toBe("next");
  });

  it("drops framework with disallowed characters", () => {
    const result = sanitizeRuntimeAnnounce({
      transports: ["http"],
      sources: ["api"],
      framework: "next js",
    });
    expect(result).toEqual({ transports: ["http"], sources: ["api"] });
  });

  it("drops framework that is too long", () => {
    const result = sanitizeRuntimeAnnounce({
      transports: ["http"],
      sources: ["api"],
      framework: "a".repeat(65),
    });
    expect(result).toEqual({ transports: ["http"], sources: ["api"] });
  });

  it("accepts both listenOrigin and framework together", () => {
    expect(
      sanitizeRuntimeAnnounce({
        transports: ["http", "sse"],
        sources: ["users"],
        listenOrigin: "http://127.0.0.1:3000",
        framework: "next",
      }),
    ).toEqual({
      transports: ["http", "sse"],
      sources: ["users"],
      listenOrigin: "http://127.0.0.1:3000",
      framework: "next",
    });
  });
});
