/**
 * What Studio is told of a request that got no answer: why, as the system
 * said it — for a call made directly and for one the proxy received — and
 * nothing of the kind for a request the upstream answered.
 */
import { createServer, type Server } from "node:http";
import { type AddressInfo, createServer as createTcpServer } from "node:net";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createHandler } from "../src/adapter";
import { createCaller } from "../src/caller";
import { courier, defineApi } from "../src/define/index";
import { _resetSourcesForTests, registerSources } from "../src/sources";
import { studioHooks } from "../src/studio";
import { UNSHOWN_CAUSE } from "../src/studio/failure-cause";
import type { StudioHooks } from "../src/studio/hooks";

const { endpoint } = courier();

let saved: StudioHooks;
const onRequestError = vi.fn();

function api(baseURL: string) {
  return defineApi({
    expose: true,
    baseURL,
    endpoints: { ping: endpoint.get("ping").response<unknown>() },
  });
}

function reportedError(): Record<string, unknown> | undefined {
  return onRequestError.mock.calls.at(-1)?.[0]?.error;
}

/* A port nothing listens on: taken, then let go. A low one such as 9 is refused by fetch itself. */
async function closedPort(): Promise<number> {
  const server = createTcpServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

beforeEach(() => {
  saved = { ...studioHooks };
  studioHooks.onRequestStart = () => {};
  studioHooks.onRequestError = onRequestError;
});

afterEach(() => {
  for (const key of Object.keys(studioHooks) as Array<keyof StudioHooks>) delete studioHooks[key];
  Object.assign(studioHooks, saved);
  onRequestError.mockReset();
  _resetSourcesForTests();
});

describe("a request that got no answer", () => {
  it("is reported with the system's code and text", async () => {
    const port = await closedPort();

    await createCaller(api(`http://127.0.0.1:${port}`))
      .ping()
      .catch(() => undefined);

    expect(reportedError()).toMatchObject({
      type: "network",
      cause: { code: "ECONNREFUSED", message: expect.stringContaining("ECONNREFUSED") },
    });
  });

  it("is reported with why when the proxy received the call", async () => {
    const port = await closedPort();
    registerSources({ api: api(`http://127.0.0.1:${port}`) });

    await createHandler().handleGet(new Request("http://app.localhost/api/request?_s=api&_m=ping"));

    expect(reportedError()?.cause).toMatchObject({ code: "ECONNREFUSED" });
  });

  it("names no user, password or token the URL carried", async () => {
    const port = await closedPort();

    await createCaller(api(`http://user:pa55@127.0.0.1:${port}/v1?token=s3cret`))
      .ping()
      .catch(() => undefined);

    const cause = reportedError()?.cause as { message: string } | undefined;
    expect(cause?.message).toMatch(/includes credentials: http:\/\/127\.0\.0\.1:\d+\/v1/);
    expect(cause?.message).not.toMatch(/s3cret|pa55/);
  });

  it("passes on none of what the app's own fetch threw", async () => {
    const thrown = 'Headers.append: "Bearer B34rer\nx" is an invalid header value.';
    const ownFetch = async (): Promise<Response> => {
      throw new TypeError(thrown);
    };
    const withOwnFetch = defineApi({
      expose: true,
      baseURL: "http://127.0.0.1:1",
      fetch: ownFetch,
      endpoints: { ping: endpoint.get("ping").response<unknown>() },
    });

    const caught = await createCaller(withOwnFetch)
      .ping()
      .catch((error: unknown) => error);

    expect(reportedError()?.cause).toEqual({ message: UNSHOWN_CAUSE });
    expect(JSON.stringify(reportedError())).not.toContain("B34rer");
    expect((caught as { data: { message: string } }).data.message).toBe(thrown);
  });
});

describe("a request the upstream answered", () => {
  let upstream: Server;

  beforeEach(async () => {
    upstream = createServer((_req, res) => {
      res.writeHead(503, { "content-type": "application/json" });
      res.end(JSON.stringify({ message: "down", code: "UPSTREAM_DOWN" }));
    });
    await new Promise<void>((resolve) => upstream.listen(0, "127.0.0.1", resolve));
  });

  afterEach(async () => {
    upstream.closeAllConnections();
    await new Promise<void>((resolve) => upstream.close(() => resolve()));
  });

  it("is reported with no cause: its body says why", async () => {
    const { port } = upstream.address() as AddressInfo;

    await createCaller(api(`http://127.0.0.1:${port}`))
      .ping()
      .catch(() => undefined);

    expect(reportedError()).toMatchObject({ type: "http", status: 503 });
    expect(reportedError()).not.toHaveProperty("cause");
  });
});
