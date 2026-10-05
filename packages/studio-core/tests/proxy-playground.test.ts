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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { callThroughProxy } from "../src/runtime/proxy-playground";

const { endpoint, stream } = courier();

const sources = {
  shop: defineApi({
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
});
