import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createGetHandler } from "../src/adapter/handle-get";
import { isOriginAllowed } from "../src/adapter/origin-policy";

const APP = "https://app.example.com";

function request(origin?: string, url = `${APP}/api/request`): Request {
  return new Request(url, { headers: origin ? { Origin: origin } : {} });
}

let nodeEnv: string | undefined;

beforeEach(() => {
  nodeEnv = process.env.NODE_ENV;
});

afterEach(() => {
  if (nodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = nodeEnv;
});

describe("isOriginAllowed", () => {
  it("allows a request with no Origin, which no hostile page can produce", () => {
    expect(isOriginAllowed(request())).toBe(true);
    expect(isOriginAllowed(request(undefined), [APP])).toBe(true);
  });

  it("allows the application's own origin", () => {
    expect(isOriginAllowed(request(APP))).toBe(true);
  });

  it("allows a configured origin", () => {
    expect(isOriginAllowed(request("https://studio.example.com"), ["https://studio.example.com"])).toBe(
      true,
    );
  });

  it("allows a sub-domain through a wildcard but not the apex", () => {
    expect(isOriginAllowed(request("https://api.example.com"), ["*.example.com"])).toBe(true);
    expect(isOriginAllowed(request("https://example.com"), ["*.example.com"])).toBe(false);
  });

  it("matches case-insensitively", () => {
    expect(isOriginAllowed(request("https://APP.example.com"), ["https://app.example.com"])).toBe(
      true,
    );
  });

  it("refuses an origin that is neither the app's own nor configured", () => {
    expect(isOriginAllowed(request("https://evil.example"), [APP])).toBe(false);
  });

  it("accepts any of several configured origins", () => {
    const allowed = ["https://a.example.com", "https://b.example.com"];

    expect(isOriginAllowed(request("https://b.example.com"), allowed)).toBe(true);
  });
});

/**
 * The production branch had no test at all, and it refused every same-origin
 * browser request — which is what made SSE unusable once deployed.
 */
describe("isOriginAllowed — production", () => {
  beforeEach(() => {
    process.env.NODE_ENV = "production";
  });

  it("serves the application's own pages when nothing is configured", () => {
    expect(isOriginAllowed(request(APP))).toBe(true);
  });

  it("serves a caller that sends no Origin when nothing is configured", () => {
    expect(isOriginAllowed(request())).toBe(true);
  });

  it("refuses another site when nothing is configured", () => {
    expect(isOriginAllowed(request("https://evil.example"))).toBe(false);
  });

  it("refuses another site when a list is configured and does not name it", () => {
    expect(isOriginAllowed(request("https://evil.example"), ["https://studio.example.com"])).toBe(
      false,
    );
  });
});

/**
 * Development stays permissive only while nothing is configured, because the
 * Studio serves itself from a different port than the app it inspects.
 */
describe("isOriginAllowed — development", () => {
  beforeEach(() => {
    process.env.NODE_ENV = "development";
  });

  it("admits another local port when nothing is configured", () => {
    expect(isOriginAllowed(request("http://localhost:6280", "http://localhost:3000/api"))).toBe(
      true,
    );
  });

  it("applies the production rule as soon as a list is configured", () => {
    expect(
      isOriginAllowed(request("http://localhost:6280", "http://localhost:3000/api"), [
        "http://localhost:4000",
      ]),
    ).toBe(false);
  });
});

/**
 * The previous rule allowed any request that omitted Origin and carried a
 * `_playground_rid` query parameter. The sigil no longer decides anything.
 */
describe("isOriginAllowed — the playground sigil is not a credential", () => {
  beforeEach(() => {
    process.env.NODE_ENV = "production";
  });

  it("does not admit a foreign origin that carries the sigil", () => {
    const req = request("https://evil.example", `${APP}/api/ws?_playground_rid=abc`);

    expect(isOriginAllowed(req)).toBe(false);
  });

  it("admits the playground's own Origin-less call on its merits", () => {
    const req = request(undefined, `${APP}/api/ws?_playground_rid=abc`);

    expect(isOriginAllowed(req)).toBe(true);
  });
});

/**
 * POST, SSE and WebSocket all checked this and GET did not, so a third-party
 * page could drive every readable endpoint with the user's cookies.
 */
describe("the GET proxy applies the same rule", () => {
  const hooks = () => ({ onProxyOriginReject: vi.fn(), onProxyReceive: vi.fn() });

  function get(origin?: string) {
    return new Request(`${APP}/api/request?_s=api&_m=list`, {
      headers: origin ? { Origin: origin } : {},
    });
  }

  it("refuses a page on another origin", async () => {
    const execute = vi.fn();
    const dt = hooks();
    const handler = createGetHandler(execute, dt as never, { allowedOrigins: [APP] });

    const response = await handler(get("https://evil.example"));

    expect(response.status).toBe(403);
    expect(execute).not.toHaveBeenCalled();
    expect(dt.onProxyOriginReject).toHaveBeenCalledOnce();
  });

  it("serves the application's own pages", async () => {
    const execute = vi.fn().mockResolvedValue(new Response("{}"));
    const handler = createGetHandler(execute, hooks() as never);

    const response = await handler(get(APP));

    expect(response.status).not.toBe(403);
    expect(execute).toHaveBeenCalledOnce();
  });

  /** A CDN or a server-to-server caller sends none, and this route exists for them. */
  it("serves a caller that sends no Origin at all", async () => {
    const execute = vi.fn().mockResolvedValue(new Response("{}"));
    const handler = createGetHandler(execute, hooks() as never, { allowedOrigins: [APP] });

    const response = await handler(get());

    expect(response.status).not.toBe(403);
    expect(execute).toHaveBeenCalledOnce();
  });
});
