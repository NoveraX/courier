import type { IncomingMessage } from "node:http";
import { describe, expect, it } from "vitest";
import { extractOriginFromNodeRequest } from "../src/node";

function mockIncomingMessage(opts: {
  host?: string | string[] | undefined;
  encrypted?: boolean;
}): IncomingMessage {
  return {
    headers: { host: opts.host },
    socket: { encrypted: opts.encrypted ?? false },
  } as unknown as IncomingMessage;
}

describe("extractOriginFromNodeRequest", () => {
  it("returns http origin for plain HTTP with Host header", () => {
    const req = mockIncomingMessage({ host: "localhost:3000" });
    expect(extractOriginFromNodeRequest(req)).toBe("http://localhost:3000");
  });

  it("returns https origin when socket is encrypted", () => {
    const req = mockIncomingMessage({ host: "app.example.com", encrypted: true });
    expect(extractOriginFromNodeRequest(req)).toBe("https://app.example.com");
  });

  it("preserves host with port", () => {
    const req = mockIncomingMessage({ host: "localhost:4330" });
    expect(extractOriginFromNodeRequest(req)).toBe("http://localhost:4330");
  });

  it("preserves bare hostname (implicit port)", () => {
    const req = mockIncomingMessage({ host: "app.example.com", encrypted: true });
    expect(extractOriginFromNodeRequest(req)).toBe("https://app.example.com");
  });

  it("returns undefined when Host header is missing", () => {
    const req = mockIncomingMessage({ host: undefined });
    expect(extractOriginFromNodeRequest(req)).toBeUndefined();
  });

  it("returns undefined when Host header is an array (malformed HTTP/1.0)", () => {
    const req = mockIncomingMessage({ host: ["a.com", "b.com"] });
    expect(extractOriginFromNodeRequest(req)).toBeUndefined();
  });

  it("takes the scheme and host a local proxy forwards, as its client used them", () => {
    const req = {
      headers: {
        host: "127.0.0.1:3000",
        "x-forwarded-proto": "https",
        "x-forwarded-host": "app.example.com",
      },
      socket: { encrypted: false, remoteAddress: "10.0.3.7" },
    } as unknown as IncomingMessage;
    expect(extractOriginFromNodeRequest(req)).toBe("https://app.example.com");
  });

  it("takes the client-facing hop of a forwarded chain", () => {
    const req = {
      headers: { host: "app.example.com", "x-forwarded-proto": "https, http" },
      socket: { encrypted: false, remoteAddress: "127.0.0.1" },
    } as unknown as IncomingMessage;
    expect(extractOriginFromNodeRequest(req)).toBe("https://app.example.com");
  });

  it("ignores forwarded headers from a caller on a public address", () => {
    const req = {
      headers: {
        host: "internal-service:8080",
        "x-forwarded-proto": "https",
        "x-forwarded-host": "victim.example.com",
      },
      socket: { encrypted: false, remoteAddress: "203.0.113.9" },
    } as unknown as IncomingMessage;
    expect(extractOriginFromNodeRequest(req)).toBe("http://internal-service:8080");
  });
});
