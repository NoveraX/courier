/**
 * A Node app behind a proxy that terminates TLS, as it runs in production.
 *
 * The socket is plain HTTP, so the request looked addressed to `http://…`
 * while the browser's `Origin` said `https://…`: every POST and WebSocket
 * from the app's own pages was refused with 403 "Origin not allowed".
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createHandler } from "../src/adapter";
import { defineApi } from "../src/define";
import { sendWebResponse, toWebRequest } from "../src/node";
import { _resetSourcesForTests, registerSources } from "../src/sources";

let server: Server | undefined;

/* Production serves every host name its operator routes to it, so the
   origin rule alone decides here. */
beforeEach(() => {
  vi.stubEnv("NODE_ENV", "production");
});

afterEach(async () => {
  vi.unstubAllEnvs();
  _resetSourcesForTests();
  server?.closeAllConnections();
  await new Promise<void>((resolve) => server?.close(() => resolve()) ?? resolve());
  server = undefined;
});

async function serveBehindProxy(): Promise<string> {
  registerSources({ api: defineApi({ baseURL: "https://upstream.example", endpoints: {} }) });
  const handler = createHandler();
  server = createServer(async (req, res) => {
    await sendWebResponse(await handler.handlePost(toWebRequest(req, res)), res);
  });
  await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/request`;
}

/** A browser's POST from the app's own page, as the proxy hands it on. */
function postFromPage(url: string, forwarded: Record<string, string>): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://app.example.com",
      ...forwarded,
    },
    body: JSON.stringify({ _s: "api", _m: "missing" }),
  });
}

describe("an app behind a TLS-terminating proxy", () => {
  it("accepts its own pages' POSTs", async () => {
    const url = await serveBehindProxy();

    const response = await postFromPage(url, {
      "X-Forwarded-Proto": "https",
      "X-Forwarded-Host": "app.example.com",
    });

    expect(response.status).not.toBe(403);
  });

  /**
   * The forwarded headers are believed from a local peer, so a request that
   * reaches the app through a proxy passing the client's own copies could
   * name the attacker's site as the app's and match its own Origin. A
   * browser's page cannot forge `Sec-Fetch-Site`, and that decides.
   */
  it("refuses another site's page that names itself in the forwarded host", async () => {
    const url = await serveBehindProxy();

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://evil.example",
        "Sec-Fetch-Site": "cross-site",
        "X-Forwarded-Proto": "https",
        "X-Forwarded-Host": "evil.example",
      },
      body: JSON.stringify({ _s: "api", _m: "missing" }),
    });

    expect(response.status).toBe(403);
  });

  it("still refuses another site's page", async () => {
    const url = await serveBehindProxy();

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://evil.example",
        "X-Forwarded-Proto": "https",
        "X-Forwarded-Host": "app.example.com",
      },
      body: JSON.stringify({ _s: "api", _m: "missing" }),
    });

    expect(response.status).toBe(403);
  });
});
