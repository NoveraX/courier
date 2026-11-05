/**
 * What the proxy logs when its gate turns a request away: a host
 * `allowedHosts` does not name (421), a page on an origin `allowedOrigins`
 * does not list, its preflight too (403), and with `browsersOnly` a request
 * no browser sent (403). Each is one warning with the setting that refused
 * it, the status, and the host or origin it was refused for — never a
 * credential or the body — at most once in 10 s for each kind, the rest
 * counted and said when the 10 s are over.
 */
import { format } from "node:util";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createHandler } from "../src/adapter";

const APP = "https://app.example.com";
const PAGE = "https://shop.example.com";
const EVIL = "https://evil.example";
const CALL = "/api/request?_s=api&_m=list";

let warned: string[] = [];

beforeEach(() => {
  warned = [];
  vi.spyOn(console, "warn").mockImplementation((...args: unknown[]) => {
    warned.push(format(...args));
  });
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("NO_COLOR", "1");
  vi.stubEnv("COURIER_LOG_LEVEL", undefined);
  vi.stubEnv("COURIER_LOG_FORMAT", undefined);
  vi.stubEnv("COURIER_ALLOWED_HOSTS", undefined);
  vi.stubEnv("COURIER_ALLOWED_ORIGINS", undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

function gatedHandler() {
  return createHandler({
    allowedHosts: ["app.example.com"],
    allowedOrigins: [PAGE],
    browsersOnly: true,
  });
}

/* The lines the gate wrote, among whatever else the handler warns of. */
function refusals(): string[] {
  return warned.filter((line) => line.includes("request refused"));
}

function fromPage(origin: string, init: RequestInit = {}): Request {
  const headers = new Headers(init.headers);
  headers.set("Origin", origin);
  headers.set("Sec-Fetch-Site", "cross-site");
  return new Request(`${APP}${CALL}`, { ...init, headers });
}

function preflightFrom(origin: string): Request {
  return new Request(`${APP}${CALL}`, {
    method: "OPTIONS",
    headers: { Origin: origin, "Access-Control-Request-Method": "POST" },
  });
}

describe("a refused request", () => {
  it("is one line naming allowedHosts, 421 and the host it was addressed to", async () => {
    const response = await gatedHandler().handle(
      new Request(`https://rebound.example:8443${CALL}`, { headers: { Origin: PAGE } }),
    );

    expect(response.status).toBe(421);
    expect(refusals()).toHaveLength(1);
    expect(refusals()[0]).toMatch(
      /courier:proxy\s+request refused by allowedHosts code=421 host=rebound\.example:8443$/,
    );
  });

  it("is one line naming allowedOrigins, 403 and the page's origin", async () => {
    const response = await gatedHandler().handleGet(fromPage(EVIL));

    expect(response.status).toBe(403);
    expect(refusals()).toEqual([
      expect.stringMatching(
        /courier:proxy\s+request refused by allowedOrigins code=403 origin=https:\/\/evil\.example$/,
      ),
    ]);
  });

  it("is the same line for the page's preflight, the one request a page may send before its call", async () => {
    const response = await gatedHandler().handle(preflightFrom(EVIL));

    expect(response.status).toBe(403);
    expect(refusals()).toEqual([
      expect.stringMatching(
        /request refused by allowedOrigins code=403 origin=https:\/\/evil\.example$/,
      ),
    ]);
  });

  it("is one line naming browsersOnly and 403 for a request no browser sent", async () => {
    const response = await gatedHandler().handlePost(
      new Request(`${APP}${CALL}`, { method: "POST", body: "{}" }),
    );

    expect(response.status).toBe(403);
    expect(refusals()).toEqual([
      expect.stringMatching(/request refused by browsersOnly code=403$/),
    ]);
  });

  it("carries none of the request's credentials, its address's query or its body", async () => {
    const handler = gatedHandler();

    await handler.handlePost(
      fromPage(EVIL, {
        method: "POST",
        headers: {
          Authorization: "Bearer eyJhbGciOiJIUzI1NiJ9.c2VjcmV0.c2lnbmVk",
          Cookie: "session=s3ss10n-c00k1e",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ password: "hunter2-hunter2" }),
      }),
    );
    await handler.handle(
      new Request(
        `https://rebound.example${CALL}&_v=${encodeURIComponent('{"email":"a@b.example"}')}`,
        {
          headers: { Authorization: "Basic dXNlcjpwYXNzd29yZA==" },
        },
      ),
    );

    const lines = refusals().join("\n");
    expect(refusals()).toHaveLength(2);
    for (const secret of [
      "eyJhbGci",
      "s3ss10n",
      "hunter2",
      "a@b.example",
      "dXNlcjpw",
      "_v=",
      "/api/request",
    ]) {
      expect(lines).not.toContain(secret);
    }
  });

  it("names an origin no browser sends by nothing it says", async () => {
    await gatedHandler().handleGet(fromPage(`${EVIL}\u001b[2J/path`));

    expect(refusals()).toEqual([
      expect.stringMatching(/request refused by allowedOrigins code=403$/),
    ]);
    expect(refusals()[0]).not.toContain("\u001b");
  });

  it("names a page with no origin of its own — a sandboxed frame, a file — by the null it sends", async () => {
    await gatedHandler().handleGet(fromPage("null"));

    expect(refusals()).toEqual([
      expect.stringMatching(/request refused by allowedOrigins code=403 origin=null$/),
    ]);
  });
});

describe("refusals made over and over", () => {
  it("are one line for two in a row, then how many more came, from whichever entry point", async () => {
    vi.useFakeTimers();
    const handler = gatedHandler();

    await handler.handleGet(fromPage(EVIL));
    await handler.handlePost(fromPage("https://other.example", { method: "POST", body: "{}" }));

    expect(refusals()).toHaveLength(1);
    vi.advanceTimersByTime(10_000);
    expect(refusals()).toEqual([
      expect.stringMatching(
        /request refused by allowedOrigins code=403 origin=https:\/\/evil\.example$/,
      ),
      expect.stringMatching(/request refused by allowedOrigins code=403: 1 more in the last 10s$/),
    ]);
  });

  it("are a line for each kind, each counted on its own", async () => {
    vi.useFakeTimers();
    const handler = gatedHandler();

    for (let round = 0; round < 3; round++) {
      await handler.handle(new Request(`https://rebound.example${CALL}`));
      await handler.handle(fromPage(EVIL));
      await handler.handle(new Request(`${APP}${CALL}`));
    }
    vi.advanceTimersByTime(10_000);

    expect(refusals()).toEqual([
      expect.stringMatching(/request refused by allowedHosts code=421 host=rebound\.example$/),
      expect.stringMatching(
        /request refused by allowedOrigins code=403 origin=https:\/\/evil\.example$/,
      ),
      expect.stringMatching(/request refused by browsersOnly code=403$/),
      expect.stringMatching(/request refused by allowedHosts code=421: 2 more in the last 10s$/),
      expect.stringMatching(/request refused by allowedOrigins code=403: 2 more in the last 10s$/),
      expect.stringMatching(/request refused by browsersOnly code=403: 2 more in the last 10s$/),
    ]);
  });

  it("are counted apart for each handler", async () => {
    await gatedHandler().handleGet(fromPage(EVIL));
    await gatedHandler().handleGet(fromPage(EVIL));

    expect(refusals()).toHaveLength(2);
  });
});

describe("a request the gate does not refuse for its host, origin or browser", () => {
  it("writes nothing: a listed page's preflight", async () => {
    const response = await gatedHandler().handle(preflightFrom(PAGE));

    expect(response.status).toBe(204);
    expect(refusals()).toEqual([]);
  });

  it("writes nothing of its own while a setting cannot be read, whose own line says why", async () => {
    const handler = createHandler({
      allowedHosts: ["app.example.com"],
      allowedOrigins: () => {
        throw new Error("the vault did not answer");
      },
    });

    const response = await handler.handleGet(fromPage(EVIL));

    expect(response.status).toBe(500);
    expect(refusals()).toEqual([]);
    expect(warned).toEqual([]);
  });
});
