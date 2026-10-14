/**
 * Answers whose body is not the JSON the source expects.
 *
 * A 2xx body that does not parse reaches a direct caller with the
 * upstream's own status, not as a 502 from a gateway that is not there. An
 * error answer whose body is text or HTML keeps that body as the error's
 * data — the upstream's own explanation of what went wrong — rather than a
 * stand-in `{ message: "HTTP 404" }`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createHandler } from "../src/adapter";
import { createCaller } from "../src/caller";
import { courier, defineApi } from "../src/define/index";
import { routesOf } from "../src/define/routes-of";
import { HTTPError } from "../src/errors";
import { createProxyCaller } from "../src/proxy-caller";
import { _resetSourcesForTests, registerSources } from "../src/sources";
import { startUpstream, type Upstream } from "./helpers/upstream";

const { endpoint } = courier();
const realFetch = globalThis.fetch;
const ANSWERS = new Map([
  ["/text", { status: 200, type: "text/plain", body: "hello" }],
  ["/broken", { status: 200, type: "application/json", body: '{"a":' }],
  ["/missing", { status: 404, type: "text/plain", body: "no such invoice" }],
  ["/boom", { status: 500, type: "text/html", body: "<h1>upstream down</h1>" }],
]);
let upstream: Upstream;

beforeEach(async () => {
  upstream = await startUpstream((request, res) => {
    const answer = ANSWERS.get(request.url);
    res.writeHead(answer?.status ?? 500, { "content-type": answer?.type ?? "text/plain" });
    res.end(answer?.body);
  });
});

afterEach(async () => {
  vi.unstubAllGlobals();
  _resetSourcesForTests();
  await upstream.close();
});

function api() {
  return defineApi({
    expose: true,
    name: "bodies",
    baseURL: upstream.url,
    endpoints: {
      text: endpoint.get("text"),
      broken: endpoint.get("broken"),
      missing: endpoint.get("missing"),
      boom: endpoint.get("boom"),
      textAnswer: endpoint
        .via((http) => http.get("text", undefined, { responseType: "text" }))
        .response<string>(),
      blobAnswer: endpoint
        .via((http) => http.get("text", undefined, { responseType: "blob" }))
        .response<Blob>(),
      missingBlob: endpoint
        .via((http) => http.get("missing", undefined, { responseType: "blob" }))
        .response<Blob>(),
    },
  });
}

async function failure(call: Promise<unknown>): Promise<HTTPError> {
  const error = await call.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(HTTPError);
  return error as HTTPError;
}

describe("a 2xx body that is not valid JSON, on a direct call", () => {
  it.each(["text", "broken"] as const)("reports the upstream's 200 for %s", async (name) => {
    const error = await failure(createCaller(api())[name]());

    expect(error.status).toBe(200);
    expect(error.data).toEqual({ success: false, message: "Failed to parse response body" });
    expect(error.cause).toBeInstanceOf(SyntaxError);
  });
});

describe("an error answer whose body is not JSON", () => {
  it("keeps a text body as the error's data", async () => {
    const error = await failure(createCaller(api()).missing());

    expect(error.status).toBe(404);
    expect(error.data).toBe("no such invoice");
  });

  it("keeps an HTML body as the error's data", async () => {
    const error = await failure(createCaller(api()).boom());

    expect(error.status).toBe(500);
    expect(error.data).toBe("<h1>upstream down</h1>");
  });

  it("keeps it through the proxy", async () => {
    const source = api();
    registerSources({ bodies: source });
    const handler = createHandler();
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.startsWith(upstream.url)) return realFetch(input, init);
      return handler.handle(new Request(new URL(url, "http://app.local"), init));
    });

    const error = await failure(createProxyCaller(routesOf(source, "bodies")).missing());

    expect(error.status).toBe(404);
    expect(error.data).toBe("no such invoice");
  });
});

describe("an endpoint that reads its answer as text or a blob", () => {
  it("gets the text and the blob a JSON source would fail to parse", async () => {
    const client = createCaller(api());

    const text = await client.textAnswer();
    const blob = await client.blobAnswer();

    expect(text).toBe("hello");
    expect(blob).toBeInstanceOf(Blob);
    expect(await blob.text()).toBe("hello");
  });

  it("reads an error answer as the source reads it", async () => {
    const error = await failure(createCaller(api()).missingBlob());

    expect(error.status).toBe(404);
    expect(error.data).toBe("no such invoice");
  });

  it("gets them through the proxy", async () => {
    const source = api();
    registerSources({ bodies: source });
    const handler = createHandler();
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.startsWith(upstream.url)) return realFetch(input, init);
      return handler.handle(new Request(new URL(url, "http://app.local"), init));
    });
    const client = createProxyCaller(routesOf(source, "bodies"));

    const text = await client.textAnswer();
    const blob = await client.blobAnswer();

    expect(text).toBe("hello");
    expect(await blob.text()).toBe("hello");
  });
});
