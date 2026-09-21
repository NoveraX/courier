/**
 * The proxy boundary: one declaration that says what the browser may call and
 * is the only thing the browser is told.
 *
 * The cases here pin both halves against the same declaration, because the
 * point of the feature is that they cannot drift — a list that gates the
 * server but describes something else to the client is two lists.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createProxyCaller } from "../src/proxy-caller";
import { defineBoundary } from "../src/define/boundary";
import { courier, defineApi, defineGroup } from "../src/define/index";
import type { Context } from "../src/http-client/types";
import { executeRequest } from "../src/utils/execute";

const { channel, endpoint, stream } = courier();

const api = defineApi({
  baseURL: "https://internal-api.corp.example",
  groups: {
    posts: defineGroup({
      prefix: "posts",
      endpoints: {
        list: endpoint.get("").response<unknown>(),
        feed: stream.get("events").response<unknown>(),
        room: channel.connect("room").response<unknown>(),
        chat: channel.connect("chat").response<unknown>().send<{ text: string }>(),
      },
    }),
    admin: defineGroup({
      prefix: "admin",
      endpoints: {
        exportPayouts: endpoint.get("payouts/export").response<unknown>(),
        purge: endpoint.del("purge").response<unknown>(),
      },
    }),
  },
});

const boundary = defineBoundary<typeof api>({
  source: "api",
  expose: {
    "posts.list": "request",
    "posts.feed": "stream",
    "posts.room": "channel",
    "posts.chat": "duplex",
  },
});

const fetchSpy = vi.fn();

/** The source as the registry holds it, with the boundary attached. */
function gatedSource() {
  const options = (api as unknown as { options: Record<string, unknown> }).options;
  return { ...(api as object), options: { ...options, boundary } } as unknown;
}

async function fromBrowser(group: string, method: string) {
  const response = (await executeRequest(
    { api: gatedSource() } as never,
    { source: "api", group, method } as never,
    {
      res: new Response(),
      proxyMethod: "GET",
      req: new Request("https://app.example.com/api/request"),
    } as Context & { res: Response },
  )) as Response;

  return { status: response.status, body: await response.text() };
}

beforeEach(() => {
  fetchSpy.mockReset();
  fetchSpy.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
  vi.stubGlobal("fetch", fetchSpy);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("defineBoundary — what it describes", () => {
  it("names only the endpoints it was given", () => {
    expect(Object.keys(boundary.endpoints).sort()).toEqual([
      "posts.chat",
      "posts.feed",
      "posts.list",
      "posts.room",
    ]);
  });

  it("carries no trace of the endpoints it kept back", () => {
    const serialized = JSON.stringify(boundary);

    expect(serialized).not.toContain("admin");
    expect(serialized).not.toContain("purge");
    expect(serialized).not.toContain("payouts");
  });

  it("carries nothing about the server's own side", () => {
    const serialized = JSON.stringify(boundary);

    expect(serialized).not.toContain("internal-api.corp.example");
    expect(serialized).not.toContain("baseURL");
    expect(serialized).not.toContain("middleware");
  });

  it("derives each transport from the API rather than being told, including whether a socket sends back", () => {
    expect(boundary.endpoints["posts.list"]).toEqual({});
    expect(boundary.endpoints["posts.feed"]).toEqual({ transport: "sse" });
    expect(boundary.endpoints["posts.room"]).toEqual({ transport: "ws" });
    expect(boundary.endpoints["posts.chat"]).toEqual({ transport: "ws", bidirectional: true });
  });

  it("is plain data, so it can be serialized to the client as it stands", () => {
    expect(JSON.parse(JSON.stringify(boundary))).toEqual(boundary);
  });
});

describe("defineBoundary — what it refuses", () => {
  it("serves an endpoint it names", async () => {
    const { status } = await fromBrowser("posts", "list");

    expect(status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("refuses an endpoint it does not name", async () => {
    const { body } = await fromBrowser("admin", "exportPayouts");

    expect(body).toContain("method not found");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("refuses a sibling in an otherwise open group", async () => {
    const narrow = defineBoundary<typeof api>({
      source: "api",
      expose: { "posts.list": "request" },
    });
    const options = (api as unknown as { options: Record<string, unknown> }).options;
    const source = { ...(api as object), options: { ...options, boundary: narrow } };

    const response = (await executeRequest(
      { api: source } as never,
      { source: "api", group: "posts", method: "feed" } as never,
      {
        res: new Response(),
        proxyMethod: "GET",
        req: new Request("https://app.example.com/api/request"),
      } as Context & { res: Response },
    )) as Response;

    expect(await response.text()).toContain("method not found");
  });

  it("answers a withheld endpoint exactly as it answers an invented one", async () => {
    const withheld = await fromBrowser("admin", "purge");
    const invented = await fromBrowser("admin", "noSuchThing");

    const shape = (body: string, name: string) => body.replace(name, "<name>");

    expect(withheld.status).toBe(invented.status);
    expect(shape(withheld.body, "purge")).toBe(shape(invented.body, "noSuchThing"));
  });

  it("overrules the coarser flags wherever it is declared", async () => {
    const options = (api as unknown as { options: Record<string, unknown> }).options;
    const source = { ...(api as object), options: { ...options, expose: true, boundary } };

    const response = (await executeRequest(
      { api: source } as never,
      { source: "api", group: "admin", method: "purge" } as never,
      {
        res: new Response(),
        proxyMethod: "GET",
        req: new Request("https://app.example.com/api/request"),
      } as Context & { res: Response },
    )) as Response;

    expect(await response.text()).toContain("method not found");
  });
});

/** A server-side caller holds the source and never addresses anything by name. */
describe("defineBoundary — in-process calls are untouched", () => {
  it("reaches a withheld endpoint from server code", async () => {
    await executeRequest({ api: gatedSource() } as never, {
      source: "api",
      group: "admin",
      method: "exportPayouts",
    } as never);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

/**
 * Forgetting to expose an endpoint used to surface as a type error deep in
 * user code — a stream fell through to the HTTP executor and failed later as
 * "sub is not async iterable", naming neither the endpoint nor the reason.
 */
describe("defineBoundary — a client says what it cannot call", () => {
  function clientFor(exposed: Record<string, string>) {
    return createProxyCaller("api", {
      boundary: defineBoundary<typeof api>({
        source: "api",
        proxyPath: { http: "/api/request" },
        expose: exposed as never,
      }),
    }) as unknown as Record<string, Record<string, (...args: unknown[]) => unknown>>;
  }

  it("names the endpoint and what to do about it", () => {
    const client = clientFor({ "posts.list": "request" });

    expect(() => client.posts!.feed!({})).toThrow(/posts\.feed.*boundary/s);
    expect(() => client.posts!.feed!({})).toThrow(/expose/);
  });

  it("still calls what the boundary does name", () => {
    const client = clientFor({ "posts.list": "request" });

    expect(() => client.posts!.list!({})).not.toThrow(/boundary/);
  });
});
