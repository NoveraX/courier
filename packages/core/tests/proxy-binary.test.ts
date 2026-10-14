/**
 * Binary bodies, and bodiless answers, through the proxy.
 *
 * An ArrayBuffer or a Blob the source downloads serializes to `{}` in JSON,
 * so the proxy answers it as bytes, marked by its content type: a binary
 * download resolves to the bytes, as in direct mode. A 204 read with `.raw`
 * resolves to the `{ status, headers, data }` it is in direct mode, not to
 * `null`. And a binary variable, which JSON would carry as
 * "[object Object]", is refused before anything is sent.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createHandler } from "../src/adapter";
import { courier, defineApi } from "../src/define/index";
import { routesOf } from "../src/define/routes-of";
import { ConfigurationError, HTTPError } from "../src/errors";
import { createProxyCaller } from "../src/proxy-caller";
import { _resetSourcesForTests, registerSources } from "../src/sources";
import { readWireBody } from "../src/utils/wire-body";
import { startUpstream, type Upstream } from "./helpers/upstream";

const { endpoint } = courier();
const realFetch = globalThis.fetch;
const BYTES = Uint8Array.from({ length: 256 }, (_, i) => i);
let upstream: Upstream;

beforeEach(async () => {
  upstream = await startUpstream((request, res) => {
    if (request.url === "/empty") {
      res.writeHead(204, { etag: '"e"' });
      res.end();
      return;
    }
    const status = request.url === "/missing" ? 404 : 200;
    res.writeHead(status, { "content-type": "image/png", "content-length": BYTES.byteLength });
    res.end(BYTES);
  });
});

afterEach(async () => {
  vi.unstubAllGlobals();
  _resetSourcesForTests();
  await upstream.close();
});

function binaryApi(responseType: "arrayBuffer" | "blob") {
  return defineApi({
    expose: true,
    name: "files",
    baseURL: upstream.url,
    responseType,
    endpoints: {
      image: endpoint.get("image").response<ArrayBuffer | Blob>(),
      missing: endpoint.get("missing"),
      empty: endpoint.del("empty"),
      put: endpoint
        .variables<{ body: Uint8Array<ArrayBuffer> }>()
        .via((http, v) => http.post("put", {}, { body: v.body })),
    },
  });
}

function proxyClient(responseType: "arrayBuffer" | "blob") {
  const source = binaryApi(responseType);
  registerSources({ files: source });
  const handler = createHandler();
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.startsWith(upstream.url)) return realFetch(input, init);
    return handler.handle(new Request(new URL(url, "http://app.localhost"), init));
  });
  return createProxyCaller(routesOf(source, "files"));
}

describe("a binary download through the proxy", () => {
  it("resolves to the bytes as an ArrayBuffer", async () => {
    const data = await proxyClient("arrayBuffer").image();

    expect(data).toBeInstanceOf(ArrayBuffer);
    expect(new Uint8Array(data as ArrayBuffer)).toEqual(BYTES);
  });

  it("resolves to a Blob carrying the upstream's type", async () => {
    const data = await proxyClient("blob").image();

    expect(data).toBeInstanceOf(Blob);
    expect((data as Blob).type).toBe("image/png");
    expect(new Uint8Array(await (data as Blob).arrayBuffer())).toEqual(BYTES);
  });

  it("resolves with .raw to the status, the headers and the bytes", async () => {
    const response = await proxyClient("arrayBuffer").raw.image();

    expect(response.status).toBe(200);
    expect(response.headers).toBeInstanceOf(Headers);
    expect(new Uint8Array(response.data as ArrayBuffer)).toEqual(BYTES);
  });

  it("rejects an error answer with its bytes as the error's data", async () => {
    const error = await proxyClient("arrayBuffer")
      .missing()
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(HTTPError);
    expect((error as HTTPError).status).toBe(404);
    expect(new Uint8Array((error as HTTPError).data as ArrayBuffer)).toEqual(BYTES);
  });
});

describe("the proxy's binary answer on the wire", () => {
  /** What a page on another origin can read of an answer without CORS exposure. */
  const SAFELISTED = ["cache-control", "content-language", "content-length", "content-type"];

  it("is marked by its content type alone, which a cross-origin page can read", async () => {
    proxyClient("blob");
    const answer = await createHandler().handlePost(
      new Request("http://app.localhost/api/request?_s=files&_m=image", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
    );
    const visible = new Headers(
      [...answer.headers].filter(([name]) => SAFELISTED.includes(name.toLowerCase())),
    );

    const data = await readWireBody(new Response(await answer.arrayBuffer(), { headers: visible }));

    expect(answer.headers.get("x-content-type-options")).toBe("nosniff");
    expect(answer.headers.get("content-length")).toBe(String(BYTES.byteLength));
    expect(data).toBeInstanceOf(Blob);
    expect((data as Blob).type).toBe("image/png");
  });
});

describe("a bodiless answer read with .raw through the proxy", () => {
  it("resolves to its status and headers, as in direct mode", async () => {
    const response = await proxyClient("arrayBuffer").raw.empty();

    expect(response.status).toBe(204);
    expect(response.headers.get("etag")).toBe('"e"');
    expect(response.data).toBeNull();
  });

  it("does the same over GET", async () => {
    const response = await proxyClient("arrayBuffer").raw.with({ method: "GET" }).image();

    expect(response.headers).toBeInstanceOf(Headers);
  });
});

describe("a binary variable through the proxy", () => {
  it("is refused before anything is sent, rather than sent as [object Object]", async () => {
    const error = await proxyClient("arrayBuffer")
      .put({ body: Uint8Array.of(1, 2, 3) })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ConfigurationError);
    expect((error as ConfigurationError).message).toContain("variables.body");
    expect(upstream.received).toEqual([]);
  });
});
