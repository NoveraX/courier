/**
 * Learning the app's origin from what the server knows of itself.
 *
 * The Playground sends its calls, their headers and bodies to this origin,
 * so it comes from the server itself — the socket a request arrived on, or
 * the framework's own address — and never from a request's headers, which
 * whoever sends the request chooses. An adapter from before 0.3.1 still
 * sends the origin a request's `Host` named: only this machine's own names
 * are taken from it.
 */
import { createServer, type IncomingMessage, request, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getAppOrigin, getAppOriginParsed, setAppOrigin } from "../src/app-origin";
import { discoverAppOrigin } from "../src/discover-app-origin";
import { discoverNodeAppOrigin, serverOriginOf } from "../src/node";

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "development");
});

afterEach(() => {
  setAppOrigin(undefined);
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("discoverAppOrigin", () => {
  it("learns where the server itself listens", () => {
    discoverAppOrigin({ serverOrigin: "http://localhost:3000" });

    expect(getAppOrigin()).toBe("http://localhost:3000");
  });

  it("keeps the first origin it learned", () => {
    discoverAppOrigin({ serverOrigin: "http://localhost:3000" });
    discoverAppOrigin({ serverOrigin: "http://192.168.1.20:3000" });

    expect(getAppOrigin()).toBe("http://localhost:3000");
  });

  it("learns nothing but an http or https origin", () => {
    discoverAppOrigin({ serverOrigin: "ftp://localhost:21" });
    discoverAppOrigin({ serverOrigin: "not a url" });
    discoverAppOrigin(undefined);

    expect(getAppOrigin()).toBeUndefined();
  });

  it("keeps the origin that was configured, and learns none in production", () => {
    setAppOrigin("https://shop.example");
    discoverAppOrigin({ serverOrigin: "http://localhost:3000" });
    expect(getAppOrigin()).toBe("https://shop.example");

    setAppOrigin(undefined);
    vi.stubEnv("NODE_ENV", "production");
    discoverAppOrigin({ serverOrigin: "http://localhost:3000" });
    expect(getAppOrigin()).toBeUndefined();
  });

  it("takes from an older adapter's Host origin only this machine's own names, and warns once", () => {
    const warned = vi.spyOn(console, "warn").mockImplementation(() => {});

    discoverAppOrigin("http://evil.example:3000");
    discoverAppOrigin("http://app.localhost:3000");
    expect(getAppOrigin()).toBeUndefined();
    expect(warned).not.toHaveBeenCalled();

    discoverAppOrigin("http://localhost:3000");
    expect(getAppOrigin()).toBe("http://localhost:3000");
    setAppOrigin(undefined);
    discoverAppOrigin("http://127.0.0.1:3000");
    expect(getAppOrigin()).toBe("http://127.0.0.1:3000");

    const warnings = warned.mock.calls.filter((call) => call.join(" ").includes("before 0.3.1"));
    expect(warnings).toHaveLength(1);
  });
});

describe("serverOriginOf", () => {
  const origin = (socket: Parameters<typeof serverOriginOf>[0]) =>
    serverOriginOf(socket)?.serverOrigin;

  it("names this machine's loopback address localhost, in IPv4, IPv6 and IPv4-in-IPv6 alike", () => {
    expect(origin({ localAddress: "127.0.0.1", localPort: 3000 })).toBe("http://localhost:3000");
    expect(origin({ localAddress: "::1", localPort: 3000 })).toBe("http://localhost:3000");
    expect(origin({ localAddress: "::ffff:127.0.0.1", localPort: 3000 })).toBe(
      "http://localhost:3000",
    );
  });

  it("writes any other address as it is, an IPv4 one in IPv6 form as IPv4", () => {
    expect(origin({ localAddress: "172.17.0.2", localPort: 3000 })).toBe("http://172.17.0.2:3000");
    expect(origin({ localAddress: "::ffff:192.168.1.20", localPort: 8080 })).toBe(
      "http://192.168.1.20:8080",
    );
    expect(origin({ localAddress: "fd00::1", localPort: 3000 })).toBe("http://[fd00::1]:3000");
    expect(origin({ localAddress: "127.0.0.2", localPort: 3000 })).toBe("http://127.0.0.2:3000");
  });

  it("says https for an encrypted socket", () => {
    expect(origin({ localAddress: "127.0.0.1", localPort: 3443, encrypted: true })).toBe(
      "https://localhost:3443",
    );
  });

  it("tells nothing without an address and a port, or for an address a URL cannot hold", () => {
    expect(origin(undefined)).toBeUndefined();
    expect(origin({ localPort: 3000 })).toBeUndefined();
    expect(origin({ localAddress: "127.0.0.1" })).toBeUndefined();
    expect(origin({ localAddress: "fe80::1%en0", localPort: 3000 })).toBeUndefined();
  });
});

describe("discoverNodeAppOrigin, on a server that listens", () => {
  let server: Server | undefined;

  afterEach(async () => {
    const listening = server;
    server = undefined;
    if (listening) await new Promise<void>((resolve) => listening.close(() => resolve()));
  });

  /* Node's `http.request`, which sends the Host it is given, as any client may. */
  function send(host: string, port: number, headers: Record<string, string>): Promise<void> {
    return new Promise((resolve, reject) => {
      const req = request({ host, port, path: "/", headers }, (res) => {
        res.resume();
        res.on("end", () => resolve());
      });
      req.on("error", reject);
      req.end();
    });
  }

  async function serve(host: string): Promise<number> {
    server = createServer((req: IncomingMessage, res) => {
      discoverNodeAppOrigin(req);
      res.end("ok");
    });
    await new Promise<void>((resolve) => server?.listen(0, host, resolve));
    return (server.address() as AddressInfo).port;
  }

  it("learns the server's own address, whatever Host and X-Forwarded-Host the request names", async () => {
    const port = await serve("127.0.0.1");

    await send("127.0.0.1", port, {
      host: "evil.example:4444",
      "x-forwarded-host": "evil.example",
    });

    expect(getAppOrigin()).toBe(`http://localhost:${port}`);
  });

  it("learns it on an IPv6 loopback listener too", async () => {
    const port = await serve("::1");

    await send("::1", port, { host: "localhost:7990" });

    expect(getAppOrigin()).toBe(`http://localhost:${port}`);
  });
});

describe("APP_ORIGIN_NOT_CONFIGURED", () => {
  it("says how the origin is learned, and where to set it", () => {
    expect(() => getAppOriginParsed()).toThrow(/learned from the server itself/);
    expect(() => getAppOriginParsed()).toThrow(/COURIER_APP_URL/);
    expect(() => getAppOriginParsed()).toThrow(/Deno, Cloudflare Workers, a server on a UNIX/);
    expect(() => getAppOriginParsed()).toThrow(/open a page that calls the API first/);
    expect(() => getAppOriginParsed()).toThrow(/docs\/api\/config#app-origin/);
  });
});
