/**
 * What Studio is told of a request the upstream refused: the size of the
 * error body it showed, and — for a call the proxy received — how its time
 * split between the proxy and the upstream, as for a call that succeeded.
 * Without them a failed row reads "0 B" and its proxy leg "0µs".
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createHandler } from "../src/adapter";
import { createCaller } from "../src/caller";
import { courier, defineApi } from "../src/define/index";
import { _resetSourcesForTests, registerSources } from "../src/sources";
import { studioHooks } from "../src/studio";
import type { StudioHooks } from "../src/studio/hooks";

const { endpoint } = courier();
const BODY = JSON.stringify({ message: "Upstream exploded" });

let upstream: Server;
let saved: StudioHooks;
const onRequestError = vi.fn();

function api(baseURL: string) {
  return defineApi({ baseURL, endpoints: { broken: endpoint.get("broken").response<unknown>() } });
}

function reported(): Record<string, unknown> | undefined {
  return onRequestError.mock.calls.at(-1)?.[0];
}

beforeEach(async () => {
  upstream = createServer((_req, res) => {
    res.writeHead(500, { "content-type": "application/json" });
    res.end(BODY);
  });
  await new Promise<void>((resolve) => upstream.listen(0, "127.0.0.1", resolve));
  const baseURL = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`;
  registerSources({ api: api(baseURL) });
  saved = { ...studioHooks };
  studioHooks.onRequestStart = () => {};
  studioHooks.onRequestError = onRequestError;
});

afterEach(async () => {
  for (const key of Object.keys(studioHooks) as Array<keyof StudioHooks>) delete studioHooks[key];
  Object.assign(studioHooks, saved);
  onRequestError.mockReset();
  _resetSourcesForTests();
  upstream.closeAllConnections();
  await new Promise<void>((resolve) => upstream.close(() => resolve()));
});

describe("a request the upstream refused", () => {
  it("is reported with the size of the error body", async () => {
    const client = createCaller(
      api(`http://127.0.0.1:${(upstream.address() as AddressInfo).port}`),
    );

    await client.broken().catch(() => undefined);

    expect(reported()?.size).toBe(BODY.length);
    expect(reported()).not.toHaveProperty("proxyTiming");
  });

  it("is reported with how its time split when the proxy received it", async () => {
    await createHandler().handleGet(
      new Request("http://app.localhost/api/request?_s=api&_m=broken"),
    );

    expect(reported()?.proxyTiming).toEqual({
      clientToProxy: 0,
      proxyToBackend: expect.any(Number),
      backendToProxy: expect.any(Number),
      proxyToClient: 0,
    });
    expect(reported()?.size).toBe(BODY.length);
  });
});
