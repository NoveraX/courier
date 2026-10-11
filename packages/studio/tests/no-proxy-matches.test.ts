/**
 * `NO_PROXY` is read as Node's own requests read it, so a host Node's
 * requests reach directly Studio's reach directly too, and one Node sends
 * through the proxy Studio sends there as well — checked against Node
 * itself, entry by entry.
 */
import { Agent, createServer, request, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { noProxyMatches } from "../src/server/no-proxy-matches";

describe("an entry of NO_PROXY", () => {
  it.each([
    ["*", "api.example.com", 443, true],
    ["api.example.com", "api.example.com", 443, true],
    ["api.example.com", "www.api.example.com", 443, false],
    ["API.Example.com", "api.example.COM", 443, true],
    ["api.example.com:8443", "api.example.com", 8443, true],
    ["api.example.com:8443", "api.example.com", 443, false],
    [".example.com", "example.com", 443, true],
    [".example.com", "api.example.com", 443, true],
    [".example.com", "badexample.com", 443, false],
    ["*.example.com", "api.example.com", 443, true],
    ["*.example.com", "example.com", 443, false],
    ["10.0.0.1-10.0.0.255", "10.0.0.7", 443, true],
    ["10.0.0.1-10.0.0.255", "10.0.1.7", 443, false],
    ["10.0.0.1-10.0.0.255", "specs.example", 443, false],
    ["10.0.0.7", "10.0.0.7", 80, true],
    [" localhost , .corp.example ", "specs.corp.example", 443, true],
    ["", "api.example.com", 443, false],
    ["localhost,", "api.example.com", 443, false],
  ])("%j names %s:%i: %s", (list, host, port, named) => {
    expect(noProxyMatches(list, host, port)).toBe(named);
  });
});

describe("NO_PROXY, beside Node's own reading of it", () => {
  let proxy: Server;
  let proxyUrl: string;
  const asked: string[] = [];

  beforeAll(async () => {
    proxy = createServer((req, res) => {
      asked.push(req.url ?? "");
      res.end("from the proxy");
    });
    await new Promise<void>((resolve) => proxy.listen(0, "127.0.0.1", resolve));
    proxyUrl = `http://127.0.0.1:${(proxy.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    proxy.closeAllConnections();
    await new Promise<void>((resolve) => proxy.close(() => resolve()));
  });

  /* A request Node sends through a proxy asks it for the whole URL; one it sends directly never reaches it. */
  function nodeSendsThroughProxy(list: string, url: string): Promise<boolean> {
    const proxyEnv = {
      ...process.env,
      http_proxy: proxyUrl,
      HTTP_PROXY: proxyUrl,
      no_proxy: list,
      NO_PROXY: list,
    };
    return new Promise((resolve) => {
      const sent = request(url, { agent: new Agent({ proxyEnv }), timeout: 3_000 }, (res) => {
        res.resume();
        res.on("end", () => resolve(asked.includes(url)));
      });
      /* Sent directly, to a name that does not resolve or a port nothing listens on. */
      sent.on("error", () => resolve(asked.includes(url)));
      sent.on("timeout", () => sent.destroy());
      sent.end();
    });
  }

  it.each([
    ["*", "http://specs.corp.invalid/a"],
    ["specs.corp.invalid", "http://specs.corp.invalid/b"],
    ["specs.corp.invalid", "http://www.specs.corp.invalid/c"],
    [".corp.invalid", "http://corp.invalid/d"],
    [".corp.invalid", "http://specs.corp.invalid/e"],
    ["*.corp.invalid", "http://corp.invalid/f"],
    ["*.corp.invalid", "http://specs.corp.invalid/g"],
    ["specs.corp.invalid:8080", "http://specs.corp.invalid:8080/h"],
    ["specs.corp.invalid:8080", "http://specs.corp.invalid/i"],
    ["specs.corp.invalid:80", "http://specs.corp.invalid/j"],
    ["127.0.0.1-127.0.0.9", "http://127.0.0.2:9/k"],
    ["127.0.0.1-127.0.0.9", "http://127.0.1.2:9/l"],
    ["SPECS.Corp.Invalid", "http://specs.corp.invalid/m"],
    ["other.invalid, specs.corp.invalid", "http://specs.corp.invalid/n"],
    ["", "http://specs.corp.invalid/o"],
  ])("agrees with Node that %j sends %s through the proxy or not", async (list, url) => {
    const { hostname, port } = new URL(url);

    const throughProxy = await nodeSendsThroughProxy(list, url);

    expect(!noProxyMatches(list, hostname, Number(port) || 80)).toBe(throughProxy);
  });
});
