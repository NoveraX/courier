/**
 * What of an upstream response reaches the browser.
 *
 * A streamed answer used to hand over the upstream's headers untouched, so
 * anything it attached — an internal trace id, a backend secret — was
 * disclosed. A buffered one was filtered against the *request*-direction
 * allowlist, which dropped `etag` and `cache-control` while keeping nothing
 * useful. Both directions are pinned here.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";

import { createHandler } from "../src/adapter";
import { courier, defineApi } from "../src/define/index";
import { _resetSourcesForTests, registerSources } from "../src/sources";
import { buildResponse } from "../src/utils/execute-response";

const PROXY = { res: new Response() };

function upstream(headers: Record<string, string>): Headers {
  return new Headers(headers);
}

describe("buildResponse — a streamed answer", () => {
  function stream(headers: Record<string, string>): Response {
    return buildResponse(PROXY, {
      status: 200,
      headers: upstream(headers),
      rawData: false,
      stream: true,
      data: new ReadableStream(),
    }) as Response;
  }

  it("does not disclose a header the upstream attached for itself", () => {
    const response = stream({
      "x-upstream-secret": "leak-me",
      "x-internal-trace": "abc",
      "content-type": "text/event-stream",
    });

    expect(response.headers.get("x-upstream-secret")).toBeNull();
    expect(response.headers.get("x-internal-trace")).toBeNull();
  });

  it("carries the content type, because the body passes through unchanged", () => {
    const response = stream({ "content-type": "text/event-stream" });

    expect(response.headers.get("content-type")).toBe("text/event-stream");
  });

  it("does not repeat the encoding of a body fetch has already decompressed", () => {
    /* The streamed bytes are decoded; `content-encoding: gzip` made the
       browser try to gunzip plain text and fail. */
    const response = stream({ "content-type": "text/plain", "content-encoding": "gzip" });

    expect(response.headers.get("content-encoding")).toBeNull();
    expect(response.headers.get("content-type")).toBe("text/plain");
  });

  it("passes on every cookie the upstream set, as a buffered answer does", () => {
    const headers = new Headers({ "content-type": "text/plain" });
    headers.append("set-cookie", "a=1; Path=/");
    headers.append("set-cookie", "b=2; Path=/");
    const response = buildResponse(PROXY, {
      status: 200,
      headers,
      rawData: false,
      stream: true,
      data: new ReadableStream(),
    }) as Response;

    expect(response.headers.getSetCookie()).toEqual(["a=1; Path=/", "b=2; Path=/"]);
  });

  it("carries the caching and rate-limit headers a client acts on", () => {
    const response = stream({
      "cache-control": "no-store",
      "x-ratelimit-remaining": "17",
      "retry-after": "30",
    });

    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-ratelimit-remaining")).toBe("17");
    expect(response.headers.get("retry-after")).toBe("30");
  });
});

describe("buildResponse — a buffered answer", () => {
  function buffered(headers: Record<string, string>): Response {
    return buildResponse(PROXY, {
      status: 200,
      headers: upstream(headers),
      rawData: false,
      data: { ok: true },
    }) as Response;
  }

  it("does not disclose a header the upstream attached for itself", () => {
    const response = buffered({ "x-upstream-secret": "leak-me", etag: '"v1"' });

    expect(response.headers.get("x-upstream-secret")).toBeNull();
  });

  it("carries the headers that describe the answer", () => {
    const response = buffered({
      etag: '"v1"',
      "cache-control": "max-age=60",
      "last-modified": "Wed, 21 Oct 2026 07:28:00 GMT",
    });

    expect(response.headers.get("etag")).toBe('"v1"');
    expect(response.headers.get("cache-control")).toBe("max-age=60");
    expect(response.headers.get("last-modified")).toBe("Wed, 21 Oct 2026 07:28:00 GMT");
  });

  it("describes the body it actually sends rather than the upstream's", () => {
    const response = buffered({ "content-type": "application/xml", "content-length": "4096" });

    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("content-length")).not.toBe("4096");
  });

  it("still forwards Set-Cookie, which an upstream sign-in depends on", () => {
    const response = buildResponse(PROXY, {
      status: 200,
      headers: upstream({ "set-cookie": "sid=abc; HttpOnly" }),
      rawData: false,
      data: { ok: true },
    }) as Response;

    expect(response.headers.getSetCookie()).toContain("sid=abc; HttpOnly");
  });
});

/**
 * A streamed answer keeps the upstream's content type, and a proxy URL can be
 * opened as a page. An upstream that answered with HTML — a user's file, an
 * SVG, an error page — ran its script on the application's origin, where it
 * could read the user's cookies.
 */
describe("a streamed proxy answer opened as a page", () => {
  let upstream: Server | undefined;

  afterEach(async () => {
    _resetSourcesForTests();
    upstream?.closeAllConnections();
    await new Promise<void>((resolve) => upstream?.close(() => resolve()) ?? resolve());
  });

  async function streamHtml(): Promise<Response> {
    upstream = createServer((_req, res) => {
      res.writeHead(200, { "content-type": "text/html" });
      res.end("<script>document.title = document.cookie</script>");
    });
    await new Promise<void>((resolve) => upstream?.listen(0, "127.0.0.1", resolve));
    const { endpoint } = courier();
    const baseURL = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`;
    registerSources({ api: defineApi({ baseURL, endpoints: { page: endpoint.get("page") } }) });

    const options = encodeURIComponent(JSON.stringify({ stream: true }));
    return createHandler().handleGet(
      new Request(`http://app.local/api/request?_s=api&_m=page&_o=${options}`, {
        headers: { "Sec-Fetch-Site": "none", "Sec-Fetch-Dest": "document" },
      }),
    );
  }

  it("is sandboxed, so its script cannot run as the application", async () => {
    const response = await streamHtml();

    expect(response.headers.get("content-type")).toBe("text/html");
    expect(response.headers.get("content-security-policy")).toContain("sandbox");
    expect(response.headers.get("content-security-policy")).toContain("default-src 'none'");
  });

  it("is not sniffed into a type the upstream did not name", async () => {
    const response = await streamHtml();

    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });
});
