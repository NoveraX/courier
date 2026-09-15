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

  it("does NOT honor x-forwarded-proto header (trust boundary)", () => {
    // Trust boundary: even if the request carries x-forwarded-proto: https,
    // extractOriginFromNodeRequest only looks at socket.encrypted. This is a
    // deliberate conservative choice — reverse-proxy users must set
    // appOrigin via courier.config.ts or COURIER_APP_URL explicitly.
    const req = {
      headers: { host: "internal-service:8080", "x-forwarded-proto": "https" },
      socket: { encrypted: false },
    } as unknown as IncomingMessage;
    expect(extractOriginFromNodeRequest(req)).toBe("http://internal-service:8080");
  });
});
