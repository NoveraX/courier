/**
 * The route a proxy caller on a server takes to its own application's
 * proxy: in the process, for a source registered here and a path of the
 * application's own; over HTTP otherwise. Registering the sources is what
 * provides it, and a page never takes it.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { type AdapterHandler, createHandler } from "../../src/adapter/create-handler";
import * as pageRegistry from "../../src/browser/capabilities/registry";
import { _resetServerCapabilitiesForTests } from "../../src/capabilities/provide-server-capability";
import { serverCapability } from "../../src/capabilities/registry";
import { courier, defineApi } from "../../src/define";
import { inProcessRoute } from "../../src/server/in-process-route";
import { onBehalfOf } from "../../src/server/session/on-behalf";
import { _resetSourcesForTests, registerSources } from "../../src/server/sources";
import type { IncomingRequest } from "../../src/session/incoming-request";

const { endpoint } = courier();
const api = defineApi({
  name: "api",
  baseURL: "https://api.test",
  endpoints: { read: endpoint.get("items") },
});

/* A proxy that answers every request at once, keeping each one it was handed. */
function proxySeeing(seen: Request[]): () => AdapterHandler {
  const proxy = createHandler();
  vi.spyOn(proxy, "handle").mockImplementation((request: Request) => {
    seen.push(request);
    return Promise.resolve(new Response("{}"));
  });
  return () => proxy;
}

afterEach(() => {
  _resetSourcesForTests();
  _resetServerCapabilitiesForTests("inProcessProxy");
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("inProcessRoute", () => {
  it("goes in process for a registered source, at the configured path", () => {
    registerSources({ api });

    const route = inProcessRoute({ http: "/courier" }, "api", proxySeeing([]));

    expect(route?.url).toBe("http://127.0.0.1/courier");
  });

  it("takes the default path when the caller names none", () => {
    registerSources({ api });

    expect(inProcessRoute(undefined, "api", proxySeeing([]))?.url).toBe(
      "http://127.0.0.1/api/request",
    );
  });

  it.each([
    ["an absolute address", "https://bff.example.com/api/request"],
    ["an address of another host without a scheme", "//bff.example.com/api/request"],
  ])("goes over HTTP for %s", (_, http) => {
    registerSources({ api });

    expect(inProcessRoute({ http }, "api", proxySeeing([]))).toBeUndefined();
  });

  it("goes over HTTP for a source this server does not register", () => {
    registerSources({ api });

    expect(inProcessRoute(undefined, "billing", proxySeeing([]))).toBeUndefined();
  });

  it("sends the request to the proxy marked as made for the request being served", async () => {
    registerSources({ api });
    const seen: Request[] = [];
    const served: IncomingRequest = {
      key: {},
      method: "GET",
      origin: "https://app.example.com",
      headers: { get: () => null },
    };
    const route = inProcessRoute(undefined, "api", proxySeeing(seen));

    await route?.transport(served)("http://127.0.0.1/api/request", { method: "POST" });

    expect(seen).toHaveLength(1);
    expect(onBehalfOf(seen[0])).toBe(served);
  });
});

describe("the in-process proxy as a server capability", () => {
  it("is provided as sources are registered", () => {
    expect(serverCapability("inProcessProxy")).toBeUndefined();

    registerSources({ api });

    expect(serverCapability("inProcessProxy")?.route(undefined, "api")?.url).toBe(
      "http://127.0.0.1/api/request",
    );
  });

  it("is taken on a server that put a DOM on its global object", () => {
    registerSources({ api });
    vi.stubGlobal("document", {});

    expect(serverCapability("inProcessProxy")).toBeDefined();
  });

  it("is not taken in a page, whose bundle reads no slot", () => {
    registerSources({ api });
    vi.stubGlobal("document", {});

    expect(pageRegistry.serverCapability("inProcessProxy")).toBeUndefined();
  });
});
