import { describe, expect, it } from "vitest";
import { handleHealth, handleCors } from "../src/http-handlers";
import type { IncomingMessage, ServerResponse } from "node:http";

// --- Mock factories ---

function createMockReq(overrides: Partial<IncomingMessage> = {}): IncomingMessage {
  return {
    url: "/",
    method: "GET",
    headers: {},
    ...overrides,
  } as IncomingMessage;
}

function createMockRes(): ServerResponse & { _status: number; _headers: Record<string, string>; _body: string } {
  const res = {
    _status: 0,
    _headers: {} as Record<string, string>,
    _body: "",
    writeHead(status: number, headers?: Record<string, string>) {
      res._status = status;
      if (headers) Object.assign(res._headers, headers);
      return res;
    },
    end(body?: string) {
      if (body) res._body = body;
    },
  };
  return res as unknown as ReturnType<typeof createMockRes>;
}

// --- handleHealth ---

describe("handleHealth", () => {
  it("returns 200 with status ok for /health", () => {
    const req = createMockReq({ url: "/health" });
    const res = createMockRes();

    const handled = handleHealth(req, res, false);

    expect(handled).toBe(true);
    expect(res._status).toBe(200);
    expect(JSON.parse(res._body)).toEqual({ status: "ok" });
    expect(res._headers["Content-Type"]).toBe("application/json");
  });

  it("returns 200 with status ready for /readyz when not shutting down", () => {
    const req = createMockReq({ url: "/readyz" });
    const res = createMockRes();

    const handled = handleHealth(req, res, false);

    expect(handled).toBe(true);
    expect(res._status).toBe(200);
    expect(JSON.parse(res._body)).toEqual({ status: "ready" });
  });

  it("returns 503 with status draining for /readyz when shutting down", () => {
    const req = createMockReq({ url: "/readyz" });
    const res = createMockRes();

    const handled = handleHealth(req, res, true);

    expect(handled).toBe(true);
    expect(res._status).toBe(503);
    expect(JSON.parse(res._body)).toEqual({ status: "draining" });
  });

  it("returns false for unrelated paths", () => {
    const req = createMockReq({ url: "/api/users" });
    const res = createMockRes();

    const handled = handleHealth(req, res, false);

    expect(handled).toBe(false);
    expect(res._body).toBe("");
  });
});

// --- handleCors ---

describe("handleCors", () => {
  describe("OPTIONS preflight", () => {
    it("returns 204 for allowed origin", () => {
      const req = createMockReq({
        method: "OPTIONS",
        headers: { origin: "http://example.com" },
      });
      const res = createMockRes();

      const handled = handleCors(req, res, ["http://example.com"]);

      expect(handled).toBe(true);
      expect(res._status).toBe(204);
      expect(res._headers["Access-Control-Allow-Origin"]).toBe("http://example.com");
      expect(res._headers["Access-Control-Allow-Methods"]).toBe("GET, POST, OPTIONS");
      expect(res._headers["Access-Control-Max-Age"]).toBe("86400");
    });

    it("returns 403 for disallowed origin", () => {
      const req = createMockReq({
        method: "OPTIONS",
        headers: { origin: "http://evil.com" },
      });
      const res = createMockRes();

      const handled = handleCors(req, res, ["http://trusted.com"]);

      expect(handled).toBe(true);
      expect(res._status).toBe(403);
      expect(res._headers["Access-Control-Allow-Origin"]).toBe("");
    });

    it("returns 204 when no allowedOrigins configured", () => {
      const req = createMockReq({
        method: "OPTIONS",
        headers: { origin: "http://any-origin.com" },
      });
      const res = createMockRes();

      const handled = handleCors(req, res, undefined);

      expect(handled).toBe(true);
      expect(res._status).toBe(204);
      expect(res._headers["Access-Control-Allow-Origin"]).toBe("http://any-origin.com");
    });

    it("returns 204 when allowedOrigins is empty array", () => {
      const req = createMockReq({
        method: "OPTIONS",
        headers: { origin: "http://any-origin.com" },
      });
      const res = createMockRes();

      const handled = handleCors(req, res, []);

      expect(handled).toBe(true);
      expect(res._status).toBe(204);
      expect(res._headers["Access-Control-Allow-Origin"]).toBe("http://any-origin.com");
    });
  });

  describe("non-OPTIONS requests", () => {
    it("blocks request from disallowed origin", () => {
      const req = createMockReq({
        method: "POST",
        headers: { origin: "http://evil.com" },
      });
      const res = createMockRes();

      const handled = handleCors(req, res, ["http://trusted.com"]);

      expect(handled).toBe(true);
      expect(res._status).toBe(403);
      expect(JSON.parse(res._body)).toEqual({ error: "Origin not allowed" });
    });

    it("returns false when origin is allowed", () => {
      const req = createMockReq({
        method: "POST",
        headers: { origin: "http://trusted.com" },
      });
      const res = createMockRes();

      const handled = handleCors(req, res, ["http://trusted.com"]);

      expect(handled).toBe(false);
    });

    it("returns false when no origin header present", () => {
      const req = createMockReq({ method: "GET", headers: {} });
      const res = createMockRes();

      const handled = handleCors(req, res, ["http://trusted.com"]);

      expect(handled).toBe(false);
    });

    it("returns false when no allowedOrigins configured", () => {
      const req = createMockReq({
        method: "POST",
        headers: { origin: "http://any.com" },
      });
      const res = createMockRes();

      const handled = handleCors(req, res, undefined);

      expect(handled).toBe(false);
    });
  });
});
