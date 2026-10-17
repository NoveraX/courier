/**
 * The Playground calling an endpoint through the app's proxy route: it
 * finds the endpoint in its group — kept under `options.groups`, at any
 * depth — and resolves, against the app's origin, the proxy path of the
 * transport the endpoint is reached by. A stream in a group was taken for
 * an HTTP endpoint: only the HTTP path was resolved, and the stream's
 * relative path was left for a process with no page to resolve it against.
 */
import { setAppOrigin } from "@noverax/courier";
import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import { STUDIO_PASS_HEADER, STUDIO_PASS_REDEEMER } from "@noverax/courier/internal";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { callThroughProxy } from "../src/runtime/proxy-playground";

const { endpoint, stream } = courier();

const sources = {
  shop: defineApi({
    expose: true,
    baseURL: "https://api.example",
    proxyPath: { http: "/api/request", sse: "/api/sse" },
    groups: {
      billing: defineGroup({
        prefix: "billing",
        groups: {
          invoices: defineGroup({
            prefix: "invoices",
            endpoints: {
              list: endpoint.get("").response<unknown>(),
              watch: stream.response<{ n: number }>().get("watch"),
              void: endpoint.post("void").expose(false),
            },
          }),
        },
      }),
    },
  }),
};

let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchSpy = vi.fn(async () => Response.json([]));
  vi.stubGlobal("fetch", fetchSpy);
  setAppOrigin("https://app.example");
});

afterEach(() => {
  vi.unstubAllGlobals();
  setAppOrigin(undefined);
  Reflect.deleteProperty(globalThis, Symbol.for("courier.studioPassBook"));
  Reflect.deleteProperty(globalThis, STUDIO_PASS_REDEEMER);
});

const call = (method: string) => ({
  source: "shop",
  group: "billing.invoices",
  method,
  variables: undefined,
  headers: {},
});

describe("a Playground call through the proxy", () => {
  it("reaches an endpoint of a group inside a group", async () => {
    await callThroughProxy(sources, call("list"), false);

    const url = new URL(String(fetchSpy.mock.calls[0]?.[0]));
    expect(`${url.origin}${url.pathname}`).toBe("https://app.example/api/request");
    expect([url.searchParams.get("_g"), url.searchParams.get("_m")]).toEqual([
      "billing.invoices",
      "list",
    ]);
  });

  it("opens a stream of a group at the proxy's stream route", async () => {
    const subscription = callThroughProxy(sources, call("watch"), false) as {
      unsubscribe?: () => void;
      close?: () => void;
    };
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    subscription.unsubscribe?.();
    subscription.close?.();

    const url = new URL(String(fetchSpy.mock.calls[0]?.[0]));
    expect(`${url.origin}${url.pathname}`).toBe("https://app.example/api/sse");
  });

  it("refuses an endpoint no mark opens, saying how to open it, and sends nothing", () => {
    expect(() => callThroughProxy(sources, call("void"), false)).toThrow(
      "shop.billing.invoices.void is not marked .expose(), so a page may not call it through the proxy",
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("the pass a Playground call through the proxy carries", () => {
  const { endpoint: get } = courier();
  const elsewhere = {
    far: defineApi({
      expose: true,
      baseURL: "https://api.example",
      proxyPath: { http: "https://proxy.elsewhere.example/api/request" },
      endpoints: { list: get.get("").response<unknown>() },
    }),
  };
  const sentHeaders = () => new Headers(fetchSpy.mock.calls[0]?.[1]?.headers as HeadersInit);

  it("goes to the app's own proxy route", async () => {
    await callThroughProxy(sources, { ...call("list"), requestId: "pg_app" }, false);

    expect(sentHeaders().get(STUDIO_PASS_HEADER)).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("never goes to a proxy route on another origin, and none is issued for it", async () => {
    const far = { source: "far", group: "", method: "list", variables: undefined, headers: {} };
    await callThroughProxy(elsewhere, { ...far, requestId: "pg_far" }, false);

    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(sentHeaders().has(STUDIO_PASS_HEADER)).toBe(false);
    expect(Reflect.get(globalThis, STUDIO_PASS_REDEEMER)).toBeUndefined();
  });

  it("is not sent for a call that names no request to issue it for", async () => {
    await callThroughProxy(sources, call("list"), false);

    expect(sentHeaders().has(STUDIO_PASS_HEADER)).toBe(false);
  });
});
