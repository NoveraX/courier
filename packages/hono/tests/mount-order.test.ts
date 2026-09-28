/**
 * Creating the Hono handlers before sources are registered.
 *
 * The factories read the registry as they were created, to announce what
 * they host, and threw SOURCES_NOT_REGISTERED at mount: routes declared at
 * module top level, with `attachRuntime()` awaited later in the entry, never
 * started. The handlers now read the registry when they serve a request.
 */
import { registerSources } from "@noverax/courier";
import { _resetSourcesForTests } from "../../core/src/sources";
import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";

import { courierHandler, courierSSEHandler, courierWSHandler } from "../src/index";

const { endpoint } = courier();

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the Hono handler factories", () => {
  it("create their handlers before any source is registered", () => {
    _resetSourcesForTests();

    expect(() => courierHandler()).not.toThrow();
    expect(() => courierSSEHandler()).not.toThrow();
    expect(() => courierWSHandler()).not.toThrow();
  });

  it("serve a call once sources are registered after the route was mounted", async () => {
    _resetSourcesForTests();
    const app = new Hono();
    app.all("/api/request", courierHandler());
    const users = defineGroup({ prefix: "users", endpoints: { list: endpoint.get("") } });
    registerSources({ api: defineApi({ baseURL: "https://upstream.example", groups: { users } }) });
    vi.stubGlobal("fetch", async () => Response.json([{ id: 1 }]));

    const response = await app.request("http://app.test/api/request", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source: "api", group: "users", method: "list" }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([{ id: 1 }]);
  });
});
