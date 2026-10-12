import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

import { courier, defineApi } from "@noverax/courier/define";
import { afterEach, describe, expect, it, vi } from "vitest";

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
    getHeader(name: string) {
      const key = Object.keys(res._headers).find((k) => k.toLowerCase() === name.toLowerCase());
      return key === undefined ? undefined : res._headers[key];
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

  /** With no origins configured, a foreign one is refused rather than every origin accepted. */
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
   * The answer carries it as the preflight does, so a configured caller that
   * passed the check can read the answer.
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

/**
 * In development a page on another port of the local machine is let through,
 * so the Studio can drive the app. Any local tool or dev server is such a
 * page, and behind a proxy on the same host the server's own address is a
 * local one too, so letting it read the answer, with the user's cookies on
 * the request, handed it the user's data. The core adapters never did.
 */
describe("handleCors — a page let through in development", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const fromLocalPage = (origin: string, method = "GET") =>
    createMockReq({
      method,
      headers: {
        host: "127.0.0.1:3001",
        origin,
        "sec-fetch-site": "cross-site",
        ...(method === "OPTIONS" ? { "access-control-request-method": "POST" } : {}),
      },
    });

  it("is served, but may not read the answer", () => {
    vi.stubEnv("NODE_ENV", "development");
    for (const origin of ["http://localhost:5173", "http://evil.localhost:8080"]) {
      const res = createMockRes();

      expect(handleCors(fromLocalPage(origin), res, undefined)).toBe(false);
      expect(res._headers["Access-Control-Allow-Origin"]).toBeUndefined();
      expect(res._headers["Access-Control-Allow-Credentials"]).toBeUndefined();
    }
  });

  it("may not read it when NODE_ENV is unset either, as a server started without it runs", () => {
    vi.stubEnv("NODE_ENV", "");
    const res = createMockRes();

    expect(handleCors(fromLocalPage("http://localhost:5173"), res, [])).toBe(false);
    expect(res._headers["Access-Control-Allow-Origin"]).toBeUndefined();
  });

  it("has its preflight refused, as the core adapters refuse it", () => {
    vi.stubEnv("NODE_ENV", "development");
    const res = createMockRes();

    expect(handleCors(fromLocalPage("http://localhost:5173", "OPTIONS"), res, undefined)).toBe(
      true,
    );
    expect(res._status).toBe(403);
    expect(res._headers["Access-Control-Allow-Origin"]).toBeUndefined();
  });

  it("reads the answer once it is listed", () => {
    vi.stubEnv("NODE_ENV", "development");
    const res = createMockRes();

    handleCors(fromLocalPage("http://localhost:5173"), res, ["http://localhost:5173"]);

    expect(res._headers["Access-Control-Allow-Origin"]).toBe("http://localhost:5173");
    expect(res._headers["Access-Control-Allow-Credentials"]).toBe("true");
  });
});

describe("handleCors — Vary", () => {
  it("names Origin beside what the response already varies by", () => {
    const res = createMockRes();
    res.setHeader("Vary", "Accept-Encoding");

    handleCors(
      createMockReq({ headers: { host: "api.example.com", origin: "http://example.com" } }),
      res,
      ["http://example.com"],
    );

    expect(res._headers.Vary).toBe("Accept-Encoding, Origin");
  });

  it("names it once, and not beside a Vary of every field", () => {
    const req = () =>
      createMockReq({ headers: { host: "api.example.com", origin: "http://example.com" } });
    const named = createMockRes();
    const every = createMockRes();
    named.setHeader("Vary", "origin");
    every.setHeader("Vary", "*");

    handleCors(req(), named, ["http://example.com"]);
    handleCors(req(), every, ["http://example.com"]);

    expect(named._headers.Vary).toBe("origin");
    expect(every._headers.Vary).toBe("*");
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

/**
 * The server as it runs, started without NODE_ENV and reached on a loopback
 * address — as behind a proxy on the same host that sends its own `Host`.
 */
describe("a running server's answer to a page on another origin", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  async function serve(allowedOrigins?: string[]) {
    const upstream = createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json", Vary: "Accept-Encoding" });
      res.end(JSON.stringify({ secret: "user-data" }));
    });
    await new Promise<void>((resolve) => upstream.listen(0, "127.0.0.1", resolve));
    const { endpoint } = courier();
    const api = defineApi({
      baseURL: `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`,
      endpoints: { me: endpoint.get("me") },
    });
    const server = createCourierServer({
      sources: { api },
      port: 0,
      host: "127.0.0.1",
      signals: false,
      ...(allowedOrigins ? { allowedOrigins } : {}),
    });
    const url = await server.ready;
    const stop = async () => {
      await server.stop();
      await new Promise<void>((resolve) => upstream.close(() => resolve()));
    };
    return { url: `${url}/api/request?_s=api&_m=me`, stop };
  }

  it("gives a local page let through no permission to read it", async () => {
    vi.stubEnv("NODE_ENV", "");
    const { url, stop } = await serve();

    const res = await fetch(url, {
      headers: { Origin: "http://localhost:5173", "Sec-Fetch-Site": "cross-site", Cookie: "s=1" },
    });
    await res.body?.cancel();

    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
    expect(res.headers.get("access-control-allow-credentials")).toBeNull();
    await stop();
  });

  it("grants a listed page, varying by Origin beside the upstream's own Vary", async () => {
    const { url, stop } = await serve(["https://app.example.com"]);

    const res = await fetch(url, {
      headers: { Origin: "https://app.example.com", "Sec-Fetch-Site": "cross-site" },
    });
    await res.body?.cancel();

    const vary = (res.headers.get("vary") ?? "").split(",").map((name) => name.trim());
    expect(res.headers.get("access-control-allow-origin")).toBe("https://app.example.com");
    expect(vary).toEqual(expect.arrayContaining(["Accept-Encoding", "Origin"]));
    await stop();
  });

  /* The grant the server makes itself, which the upstream's own Vary replaced. */
  it("varies by Origin beside the upstream's Vary when it grants its own page", async () => {
    const { url, stop } = await serve();
    const own = new URL(url).origin;

    const res = await fetch(url, { headers: { Origin: own, "Sec-Fetch-Site": "same-origin" } });
    await res.body?.cancel();

    expect(res.headers.get("access-control-allow-origin")).toBe(own);
    expect(res.headers.get("vary")).toBe("Origin, Accept-Encoding");
    await stop();
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
