/**
 * `stream: true` on an endpoint with a response schema.
 *
 * The schema was once run on the unread stream, so every valid answer failed
 * with a 422 that blamed the upstream's payload. Skipping it instead let a
 * browser opt out of the schema: a proxy call that asked for a stream got the
 * upstream's raw body, every field the schema strips included.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";

import { createHandler } from "../src/adapter";
import { createCaller } from "../src/caller";
import { courier, defineApi, defineGroup } from "../src/define/index";
import { _resetSourcesForTests, registerSources } from "../src/sources";

const { endpoint } = courier();
let upstream: Server | undefined;

function defineItems(baseURL: string) {
  return defineApi({
    baseURL,
    groups: {
      items: defineGroup({
        endpoints: {
          list: endpoint.get("list").response<unknown>(),
          typed: endpoint.get("typed").response(z.object({ id: z.number() })),
        },
      }),
    },
  });
}

let api: ReturnType<typeof defineItems>;

beforeEach(async () => {
  upstream = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ id: 1, secret: "server-only" }));
  });
  await new Promise<void>((resolve) => upstream?.listen(0, "127.0.0.1", resolve));
  api = defineItems(`http://127.0.0.1:${(upstream.address() as AddressInfo).port}`);
  registerSources({ api });
});

afterEach(async () => {
  _resetSourcesForTests();
  upstream?.closeAllConnections();
  await new Promise<void>((resolve) => upstream?.close(() => resolve()) ?? resolve());
});

function proxyGet(method: string, options: Record<string, unknown>): Promise<Response> {
  const encoded = encodeURIComponent(JSON.stringify(options));
  return createHandler().handleGet(
    new Request(`http://app.local/api/request?_s=api&_g=items&_m=${method}&_o=${encoded}`),
  );
}

describe("a proxy call that asks for a stream", () => {
  it("is refused for an endpoint whose response schema decides what the caller reads", async () => {
    const response = await proxyGet("typed", { stream: true });

    expect(response.status).toBe(400);
    expect(await response.text()).not.toContain("server-only");
  });

  it("gets the schema's output when it does not ask for one", async () => {
    const response = await proxyGet("typed", {});

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: 1 });
  });

  it("streams an endpoint that declares no schema", async () => {
    const response = await proxyGet("list", { stream: true });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: 1, secret: "server-only" });
  });
});

describe("a server-side call that asks for a stream", () => {
  it("passes through; the schema describes the value, not the bytes", async () => {
    const body = await createCaller(api).items.with({ stream: true }).typed();

    expect(await new Response(body).json()).toEqual({ id: 1, secret: "server-only" });
  });
});
