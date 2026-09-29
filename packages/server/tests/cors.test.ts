import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

import { courier, defineApi } from "@noverax/courier/define";
import { describe, expect, it } from "vitest";

import { handleCors } from "../src/cors";
import { createCourierServer } from "../src/create-server";

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

  it("refuses it with the body every adapter answers a refused origin with", () => {
    const res = createMockRes();

    handleCors(preflight("http://evil.com"), res, ["http://trusted.com"]);

    expect(JSON.parse(res._body)).toEqual({ success: false, message: "Origin not allowed" });
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
    expect(JSON.parse(res._body)).toEqual({ success: false, message: "Origin not allowed" });
  });

  it("serves the server's own origin without needing configuration", () => {
    const res = createMockRes();

    expect(handleCors(request("http://api.example.com"), res, undefined)).toBe(false);
  });
});

describe("handleCors — the browser's own verdict", () => {
  /**
   * Behind a proxy that terminates TLS on an address the server does not
   * trust with X-Forwarded-*, the socket says http while the page is https.
   * The browser still knows the page is the server's own.
   */
  it("serves a page the browser calls same-origin whatever its Origin says", () => {
    const res = createMockRes();
    const req = createMockReq({
      method: "POST",
      headers: {
        host: "api.example.com",
        origin: "https://api.example.com",
        "sec-fetch-site": "same-origin",
      },
    });

    expect(handleCors(req, res, undefined)).toBe(false);
    expect(res._status).toBe(0);
  });

  it("refuses a request the browser calls cross-site even when it carries no Origin", () => {
    const res = createMockRes();
    const req = createMockReq({
      headers: { host: "api.example.com", "sec-fetch-site": "cross-site" },
    });

    expect(handleCors(req, res, ["https://app.example.com"])).toBe(true);
    expect(res._status).toBe(403);
  });

  it("serves a configured page the browser calls cross-site", () => {
    const res = createMockRes();
    const req = createMockReq({
      headers: {
        host: "api.example.com",
        origin: "https://app.example.com",
        "sec-fetch-site": "cross-site",
      },
    });

    expect(handleCors(req, res, ["https://app.example.com"])).toBe(false);
    expect(res._headers["Access-Control-Allow-Origin"]).toBe("https://app.example.com");
  });
});

describe("the origin gate on a running server", () => {
  it("serves a same-origin POST whose Origin differs from the socket's scheme", async () => {
    const upstream = createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    });
    await new Promise<void>((resolve) => upstream.listen(0, "127.0.0.1", resolve));
    const { endpoint } = courier();
    const api = defineApi({
      baseURL: `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`,
      endpoints: { save: endpoint.post("save") },
    });
    const server = createCourierServer({ sources: { api }, port: 0, signals: false });
    const url = await server.ready;

    const res = await fetch(`${url}/api/request?_s=api&_m=save`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: url.replace("http://", "https://"),
        "Sec-Fetch-Site": "same-origin",
      },
      body: JSON.stringify({ variables: {} }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    await server.stop();
    await new Promise<void>((resolve) => upstream.close(() => resolve()));
  });
});

describe("a cross-origin answer", () => {
  it("lets the page read the headers the proxy passes back", async () => {
    const upstream = createServer((_req, res) => {
      res.writeHead(503, { "Content-Type": "application/json", "Retry-After": "7", ETag: '"v1"' });
      res.end(JSON.stringify({ busy: true }));
    });
    await new Promise<void>((resolve) => upstream.listen(0, "127.0.0.1", resolve));
    const { endpoint } = courier();
    const api = defineApi({
      baseURL: `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`,
      endpoints: { busy: endpoint.get("busy") },
    });
    const server = createCourierServer({
      sources: { api },
      port: 0,
      host: "127.0.0.1",
      signals: false,
      allowedOrigins: ["http://app.example"],
    });
    const url = await server.ready;

    const res = await fetch(`${url}/api/request?_s=api&_m=busy`, {
      headers: { Origin: "http://app.example" },
    });
    await res.body?.cancel();

    const exposed = (res.headers.get("access-control-expose-headers") ?? "")
      .split(",")
      .map((name) => name.trim().toLowerCase());
    expect(res.headers.get("retry-after")).toBe("7");
    expect(exposed).toEqual(expect.arrayContaining(["retry-after", "etag"]));
    await server.stop();
    await new Promise<void>((resolve) => upstream.close(() => resolve()));
  });
});
