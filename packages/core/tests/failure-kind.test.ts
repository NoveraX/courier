/**
 * What kind of failure Studio is told a request ended in.
 *
 * A cancellation — the caller aborting its call, or a proxied call whose
 * browser left — is reported as aborted, not as an "unknown" failure that
 * Studio would show as a red error and count against the endpoint.
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

let upstream: Server;
let baseURL: string;
let saved: StudioHooks;
const onRequestError = vi.fn();

interface Client {
  with: (options: { signal?: AbortSignal; timeout?: number }) => Client;
  slow: () => Promise<unknown>;
  shape: () => Promise<unknown>;
}

function api() {
  return defineApi({
    baseURL,
    endpoints: {
      slow: endpoint.get("slow").response<unknown>(),
      shape: endpoint.get("shape").response({
        "~standard": {
          version: 1,
          vendor: "test",
          validate: () => ({ issues: [{ message: "Expected a number", path: ["count"] }] }),
        },
      }),
    },
  });
}

function errorKind(): string | undefined {
  return onRequestError.mock.calls.at(-1)?.[0]?.error?.type;
}

beforeEach(async () => {
  upstream = createServer((req, res) => {
    const timer = setTimeout(
      () => res.end(JSON.stringify({ count: "x" })),
      req.url === "/slow" ? 2_000 : 0,
    );
    res.on("close", () => clearTimeout(timer));
  });
  await new Promise<void>((resolve) => upstream.listen(0, "127.0.0.1", resolve));
  baseURL = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`;
  registerSources({ api: api() });
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

describe("the failure a request is reported with", () => {
  it("is aborted when the caller aborts its call", async () => {
    const client = createCaller(api()) as unknown as Client;
    const controller = new AbortController();
    const call = client.with({ signal: controller.signal }).slow();

    setTimeout(() => controller.abort(), 20);
    await call.catch(() => {});

    expect(errorKind()).toBe("aborted");
  });

  it("is aborted when the caller aborts with a reason of its own", async () => {
    const client = createCaller(api()) as unknown as Client;
    const controller = new AbortController();
    const call = client.with({ signal: controller.signal }).slow();

    setTimeout(() => controller.abort("navigated away"), 20);
    await call.catch(() => {});

    expect(errorKind()).toBe("aborted");
  });

  it("is aborted when a proxied call's browser leaves", async () => {
    const browser = new AbortController();
    const answer = createHandler().handleGet(
      new Request("http://app.localhost/api/request?_s=api&_m=slow", { signal: browser.signal }),
    );

    setTimeout(() => browser.abort(), 20);
    await answer;

    expect(errorKind()).toBe("aborted");
  });

  it("is a timeout when the call runs out of time", async () => {
    const client = createCaller(api()) as unknown as Client;

    await client
      .with({ timeout: 20 })
      .slow()
      .catch(() => {});

    expect(errorKind()).toBe("timeout");
  });

  it("is a validation failure when the response breaks its schema", async () => {
    const client = createCaller(api()) as unknown as Client;

    await client.shape().catch(() => {});

    expect(errorKind()).toBe("validation");
  });
});
