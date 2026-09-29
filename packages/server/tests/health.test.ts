import type { IncomingMessage, ServerResponse } from "node:http";

import { describe, expect, it } from "vitest";

import { handleHealth } from "../src/health";

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

function createMockRes(): ServerResponse & {
  _status: number;
  _headers: Record<string, string>;
  _body: string;
} {
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
