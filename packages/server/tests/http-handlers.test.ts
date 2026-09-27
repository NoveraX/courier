import { describe, expect, it } from "vitest";
import { handleHealth, handleCors } from "../src/http-handlers";
import type { IncomingMessage, ServerResponse } from "node:http";

// --- Mock factories ---

function createMockReq(overrides: Partial<IncomingMessage> = {}): IncomingMessage {
  return {
    url: "/",
    method: "GET",
    headers: {},
    socket: { remoteAddress: "127.0.0.1" },
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
    setHeader(name: string, value: string) {
      res._headers[name] = value;
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

describe("handleCors — preflight", () => {
  const preflight = (origin: string) =>
    createMockReq({ method: "OPTIONS", headers: { origin, host: "api.example.com" } });

  it("answers a configured origin with permission to proceed", () => {
    const res = createMockRes();

    const handled = handleCors(preflight("http://example.com"), res, ["http://example.com"]);

    expect(handled).toBe(true);
    expect(res._status).toBe(204);
    expect(res._headers["Access-Control-Allow-Origin"]).toBe("http://example.com");
    expect(res._headers["Access-Control-Allow-Credentials"]).toBe("true");
    expect(res._headers.Vary).toBe("Origin, Access-Control-Request-Headers");
    expect(res._headers["Access-Control-Max-Age"]).toBe("86400");
  });

  it("matches a wildcard the way the rest of the project does", () => {
    const res = createMockRes();

    handleCors(preflight("https://api.example.com"), res, ["*.example.com"]);

    expect(res._status).toBe(204);
  });

  it("refuses an origin that is not configured, granting nothing", () => {
    const res = createMockRes();

    const handled = handleCors(preflight("http://evil.com"), res, ["http://trusted.com"]);

    expect(handled).toBe(true);
    expect(res._status).toBe(403);
    expect(res._headers["Access-Control-Allow-Origin"]).toBeUndefined();
  });

  /** Accepting every origin because none was configured is the bug, not the default. */
  it("refuses a foreign origin when nothing is configured", () => {
    const res = createMockRes();

    handleCors(preflight("http://any-origin.com"), res, undefined);

    expect(res._status).toBe(403);
  });

  it("serves the server's own origin when nothing is configured", () => {
    const res = createMockRes();

    handleCors(preflight("http://api.example.com"), res, []);

    expect(res._status).toBe(204);
  });
});

describe("handleCors — the request itself", () => {
  const request = (origin?: string) =>
    createMockReq({ headers: { host: "api.example.com", ...(origin ? { origin } : {}) } });

  it("lets a request with no Origin through untouched", () => {
    const res = createMockRes();

    expect(handleCors(request(), res, ["http://example.com"])).toBe(false);
    expect(res._headers["Access-Control-Allow-Origin"]).toBeUndefined();
  });

  /**
   * Only the preflight used to carry this, so a configured caller passed the
   * check and then could not read the answer.
   */
  it("grants a configured origin permission on the answer, not only the preflight", () => {
    const res = createMockRes();

    const handled = handleCors(request("http://example.com"), res, ["http://example.com"]);

    expect(handled).toBe(false);
    expect(res._headers["Access-Control-Allow-Origin"]).toBe("http://example.com");
    expect(res._headers["Access-Control-Allow-Credentials"]).toBe("true");
    expect(res._headers.Vary).toBe("Origin");
  });

  it("blocks a request from an origin that is not configured", () => {
    const res = createMockRes();

    const handled = handleCors(request("http://evil.com"), res, ["http://trusted.com"]);

    expect(handled).toBe(true);
    expect(res._status).toBe(403);
    expect(JSON.parse(res._body).error).toContain("Origin");
  });

  it("serves the server's own origin without needing configuration", () => {
    const res = createMockRes();

    expect(handleCors(request("http://api.example.com"), res, undefined)).toBe(false);
  });
});
