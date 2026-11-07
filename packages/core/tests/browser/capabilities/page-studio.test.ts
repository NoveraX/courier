/**
 * Studio's runtime, attached in a page's bundle, is told of the page's
 * calls, as a page's bundle builds them — the stand-ins of the registry
 * and of Studio's hooks in the place of a server's. The page keeps the
 * hooks in its own bundle, where the runtime sets them, and the runtime's
 * view of the calls in the page's own slot; the page's calls reach the
 * hooks through it: a proxy call's time from the browser and its upload,
 * a direct call's start, end and middleware, and a stream the page opens.
 * None of it is the server's registry, which a page reads nothing of.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { createCaller } from "../../../src/caller";
import { defineApi } from "../../../src/define/api";
import { courier } from "../../../src/define/courier";
import { routesOf } from "../../../src/define/routes-of";
import { defineMiddleware } from "../../../src/middleware/define";
import { createProxyCaller } from "../../../src/proxy-caller";
/* What Studio's runtime does in the page: it loads the hooks, and with them its view of the calls. */
import { studioHooks } from "../../../src/studio";
import { STUDIO_REQUEST_HEADER } from "../../../src/utils/studio-request-id";

vi.mock(
  "../../../src/capabilities/registry",
  () => import("../../../src/browser/capabilities/registry"),
);
vi.mock("../../../src/studio/singleton", () => import("../../../src/browser/studio/singleton"));

const { endpoint, stream } = courier();
const APP = "https://app.example.com";

function accountsApi() {
  return defineApi({
    expose: true,
    name: "accounts",
    baseURL: "https://api.example.com",
    middleware: [defineMiddleware("tag", "before", () => undefined)],
    endpoints: {
      me: endpoint.get("me"),
      upload: endpoint.post("upload").variables<FormData>(),
      live: stream.response<number>().get("live"),
    },
  });
}

function form(): FormData {
  const body = new FormData();
  body.append("file", new Blob([new Uint8Array(64 * 1024)]), "photo.bin");
  return body;
}

/* The page's network: what it sent, answered as the proxy or the API answers. */
function network(answer: (url: string, init: RequestInit | undefined) => Promise<Response>) {
  const sent: Array<{ url: string; headers: Headers }> = [];
  vi.stubGlobal("document", { cookie: "" });
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    sent.push({ url, headers: new Headers(init?.headers) });
    return answer(url, init);
  });
  return sent;
}

afterEach(() => {
  for (const hook of Object.keys(studioHooks)) Reflect.deleteProperty(studioHooks, hook);
  vi.unstubAllGlobals();
});

describe("a page whose bundle runs Studio's runtime", () => {
  it("tells it how a proxy call's time split, under the id the proxy answered with", async () => {
    const timing = vi.fn();
    studioHooks.onProxyClientTiming = timing;
    network(async () =>
      Response.json(
        { ok: true },
        { headers: { [STUDIO_REQUEST_HEADER]: "req_page_0001", "server-timing": "courier;dur=3" } },
      ),
    );
    const client = createProxyCaller(routesOf(accountsApi(), "accounts"), {
      proxyPath: { http: `${APP}/api/request` },
    });

    await client.me();

    expect(timing).toHaveBeenCalledTimes(1);
    expect(timing.mock.calls[0]?.[0]).toMatchObject({
      requestId: "req_page_0001",
      networkLatency: expect.any(Number),
      download: expect.any(Number),
      totalRoundTrip: expect.any(Number),
      timestamp: expect.any(Number),
    });
  });

  it("tells it of an upload sent through the proxy, under the id the call sends", async () => {
    const progress = vi.fn();
    const complete = vi.fn();
    studioHooks.onUploadProgress = progress;
    studioHooks.onUploadComplete = complete;
    const sent = network(async (_url, init) => {
      await new Response(init?.body ?? null).arrayBuffer();
      return Response.json({ ok: true });
    });
    const client = createProxyCaller(routesOf(accountsApi(), "accounts"), {
      proxyPath: { http: `${APP}/api/request` },
    });

    await client.with({ onUploadProgress: () => {} }).upload(form());

    const id = sent[0]?.headers.get(STUDIO_REQUEST_HEADER);
    expect(id).toMatch(/^up_/);
    expect(progress).toHaveBeenCalled();
    expect(progress.mock.calls.at(-1)?.[0]).toMatchObject({
      requestId: id,
      source: "accounts",
      method: "upload",
      percentage: 100,
    });
    expect(
      complete.mock.calls.map(([event]) => (event as { requestId: string }).requestId),
    ).toEqual([id]);
  });

  it("tells it a direct call started and ended, and what its middleware did", async () => {
    const started = vi.fn();
    const ended = vi.fn();
    const entered = vi.fn();
    studioHooks.onRequestStart = started;
    studioHooks.onRequestEnd = ended;
    studioHooks.onMiddlewareEnter = entered;
    network(async () => Response.json({ ok: true }));

    await createCaller(accountsApi()).me();

    expect(started).toHaveBeenCalledTimes(1);
    expect(started.mock.calls[0]?.[0]).toMatchObject({ source: "accounts", method: "me" });
    expect(ended).toHaveBeenCalledTimes(1);
    expect(entered.mock.calls[0]?.[0]).toMatchObject({ name: "tag" });
  });

  it("tells it of a stream the page opens", async () => {
    const opened = vi.fn();
    studioHooks.onStreamOpen = opened;
    network(
      async () => new Response("data: 1\n\n", { headers: { "content-type": "text/event-stream" } }),
    );

    const sub = createCaller(accountsApi()).live();
    for await (const _event of sub) break;
    sub.close();

    expect(opened).toHaveBeenCalled();
    expect(opened.mock.calls[0]?.[0]).toMatchObject({
      source: "accounts",
      method: "live",
      transport: "sse",
      mode: "direct",
    });
    /* Told again as the answer's headers arrive, under the same id. */
    const ids = opened.mock.calls.map(([event]) => (event as { requestId: string }).requestId);
    expect(new Set(ids).size).toBe(1);
  });
});
