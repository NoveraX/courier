import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createHandler } from "../src/adapter";
import { createGetHandler } from "../src/adapter/handle-get";
import { isOriginAccepted, isOriginAllowed } from "../src/adapter/origin-policy";
import { courier, defineApi, defineGroup } from "../src/define";
import { sendWebResponse, toWebRequest } from "../src/node";
import { _resetSourcesForTests, registerSources } from "../src/sources";

const APP = "https://app.example.com";

function request(origin?: string, url = `${APP}/api/request`): Request {
  return new Request(url, { headers: origin ? { Origin: origin } : {} });
}

afterEach(() => {
  vi.unstubAllEnvs();
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
    expect(
      isOriginAllowed(request("https://studio.example.com"), ["https://studio.example.com"]),
    ).toBe(true);
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
 * In production the policy admits a same-origin browser request: refusing
 * it leaves SSE unusable once deployed.
 */
describe("isOriginAllowed — production", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
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
    vi.stubEnv("NODE_ENV", "development");
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

  it("admits it for an app served from the local machine under any of its names", () => {
    expect(isOriginAccepted("http://127.0.0.1:6280", "http://app.localhost:3000")).toBe(true);
    expect(
      isOriginAccepted("http://[::1]:6280", "http://127.0.0.2:3000", undefined, "cross-site"),
    ).toBe(true);
  });
});

/**
 * A server started without `NODE_ENV` is read as in development, and an app
 * deployed on a public address is still never one a page on the visitor's
 * own machine may drive: what runs there — a local tool, a dev server, an
 * installed app — is not the application's.
 */
describe("isOriginAllowed — the local allowance on a public address", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "");
  });

  it("refuses a page on the visitor's own machine, whatever the browser marks", () => {
    expect(isOriginAllowed(request("http://localhost:8080"))).toBe(false);
    expect(isOriginAccepted("http://127.0.0.1:9000", APP, undefined, "cross-site")).toBe(false);
    expect(isOriginAccepted("http://[::1]:9000", APP, undefined, "same-site")).toBe(false);
  });

  it("refuses it where the app's own address is unknown", () => {
    expect(isOriginAccepted("http://localhost:8080", null, undefined, "cross-site")).toBe(false);
  });
});

/**
 * A request that omits Origin is not let through for carrying a
 * `_playground_rid` query parameter: anyone can add the sigil, so it decides
 * nothing.
 */
describe("isOriginAllowed — the playground sigil is not a credential", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
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
 * GET is checked as POST, SSE and WebSocket are: unchecked, it would let a
 * third-party page drive every readable endpoint with the user's cookies.
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

/**
 * A browser says whether a request is same-origin in `Sec-Fetch-Site`, a
 * header no page can write. The request URL a framework reports is not always
 * the one the browser used — Next.js builds it from the host it was started
 * with — so comparing `Origin` against it refused the app's own pages.
 */
describe("isOriginAllowed — the browser's own verdict", () => {
  function fromBrowser(site: string, origin?: string, url = "http://localhost:7352/api/request") {
    const headers: Record<string, string> = { "Sec-Fetch-Site": site };
    if (origin) headers.Origin = origin;
    return new Request(url, { method: "POST", headers });
  }

  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
  });

  it("serves a same-origin page when the framework reports another host in the URL", () => {
    expect(isOriginAllowed(fromBrowser("same-origin", "http://127.0.0.1:7352"))).toBe(true);
  });

  it("serves a request the user started from the address bar", () => {
    expect(isOriginAllowed(fromBrowser("none"))).toBe(true);
  });

  it("refuses a cross-site request that carries no Origin, such as an image", () => {
    expect(isOriginAllowed(fromBrowser("cross-site"))).toBe(false);
    expect(isOriginAllowed(fromBrowser("same-site"))).toBe(false);
  });

  it("refuses a cross-site page even when its Origin matches the reported URL", () => {
    const request = fromBrowser("cross-site", APP, `${APP}/api/request`);

    expect(isOriginAllowed(request)).toBe(false);
  });

  it("serves a cross-site page that is configured", () => {
    const request = fromBrowser("cross-site", "https://studio.example.com");

    expect(isOriginAllowed(request, ["https://studio.example.com"])).toBe(true);
  });

  it("keeps the development allowance for another local port", () => {
    vi.stubEnv("NODE_ENV", "development");

    expect(isOriginAllowed(fromBrowser("same-site", "http://localhost:6280"))).toBe(true);
  });

  it("applies the same verdict to a server that passes the header in parts", () => {
    expect(isOriginAccepted(undefined, APP, undefined, "cross-site")).toBe(false);
    expect(isOriginAccepted("http://127.0.0.1:7352", APP, undefined, "same-origin")).toBe(true);
  });
});

describe("isOriginAllowed — a wildcard with a scheme", () => {
  const allowed = ["https://*.example.com"];

  it("matches a sub-domain over the scheme it names", () => {
    expect(isOriginAllowed(request("https://a.example.com"), allowed)).toBe(true);
    expect(isOriginAllowed(request("https://a.b.example.com"), allowed)).toBe(true);
  });

  it("refuses the same sub-domain over another scheme", () => {
    expect(isOriginAllowed(request("http://a.example.com"), allowed)).toBe(false);
  });

  it("refuses the apex and a host that only ends in the same letters", () => {
    expect(isOriginAllowed(request("https://example.com"), allowed)).toBe(false);
    expect(isOriginAllowed(request("https://evilexample.com"), allowed)).toBe(false);
  });

  it("matches the port it names and no other", () => {
    const withPort = ["https://*.example.com:8443"];

    expect(isOriginAllowed(request("https://a.example.com:8443"), withPort)).toBe(true);
    expect(isOriginAllowed(request("https://a.example.com"), withPort)).toBe(false);
    expect(isOriginAllowed(request("https://a.example.com:9443"), allowed)).toBe(false);
  });
});

/**
 * An `<img>` or a link on another site sends no `Origin`, so the rule that
 * admits an Origin-less request let any page drive a proxy GET with the
 * user's cookies — including a `.reads()` endpoint that POSTs upstream.
 */
describe("a proxy GET started by another site's page", () => {
  let upstream: Server | undefined;
  let app: Server | undefined;
  const upstreamHits: string[] = [];

  afterEach(async () => {
    _resetSourcesForTests();
    upstreamHits.length = 0;
    for (const server of [app, upstream]) {
      server?.closeAllConnections();
      await new Promise<void>((resolve) => server?.close(() => resolve()) ?? resolve());
    }
    app = undefined;
    upstream = undefined;
  });

  async function listen(server: Server): Promise<string> {
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }

  async function serveApp(): Promise<string> {
    upstream = createServer((req, res) => {
      upstreamHits.push(`${req.method} ${req.url}`);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    });
    const { endpoint } = courier();
    const echo = defineGroup({
      prefix: "echo",
      endpoints: { search: endpoint.post("search").reads() },
    });
    registerSources({ api: defineApi({ baseURL: await listen(upstream), groups: { echo } }) });

    const handler = createHandler();
    app = createServer(async (req, res) => {
      await sendWebResponse(await handler.handle(toWebRequest(req, res)), res);
    });
    return `${await listen(app)}/api/request?_s=api&_g=echo&_m=search`;
  }

  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
  });

  it("is refused before anything reaches the upstream", async () => {
    const url = await serveApp();

    const response = await fetch(url, {
      headers: { "Sec-Fetch-Site": "cross-site", "Sec-Fetch-Dest": "image", Cookie: "s=1" },
    });

    expect(response.status).toBe(403);
    expect(upstreamHits).toEqual([]);
  });

  it("is served when the app's own page makes it", async () => {
    const url = await serveApp();

    const response = await fetch(url, { headers: { "Sec-Fetch-Site": "same-origin" } });

    expect(response.status).toBe(200);
    expect(upstreamHits).toEqual(["POST /echo/search"]);
  });
});
