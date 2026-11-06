/**
 * A cancelled call rejects with Courier's `AbortError`, whatever cancelled
 * it and wherever it was: the caller's signal — before the request left,
 * while it was out, or while a middleware held it between attempts — with
 * the reason the caller gave as its cause, and a newer call of its
 * endpoint that superseded it, with the code `SUPERSEDED`. A deadline that
 * ran out stays a `TimeoutError`, and a cancellation is no failure
 * `onError` is told of.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createCaller } from "../src/caller";
import { courier, defineApi } from "../src/define/index";
import { routesOf } from "../src/define/routes-of";
import { AbortError, isAbortError, isRequestFailure, TimeoutError } from "../src/errors";
import { createFetch } from "../src/fetch";
import { retryMiddleware } from "../src/middleware/index";
import { createProxyCaller } from "../src/proxy-caller";
import { _resetSourcesForTests, registerSources } from "../src/server/sources";
import { asBrowserPage } from "./helpers/browser-page";

const { endpoint } = courier();
const UPSTREAM = "https://upstream.example";

/* An upstream that refuses `/flaky` at once and answers anything else after a pause, or rejects
   as fetch does once its request is cancelled. */
const upstream = vi.fn((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const signal = input instanceof Request ? input.signal : init?.signal;
  const url = input instanceof Request ? input.url : String(input);
  if (url.includes("/flaky")) return Promise.resolve(new Response(null, { status: 503 }));
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const timer = setTimeout(() => resolve(Response.json({ ok: true })), 200);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });
});

const api = defineApi({
  expose: true,
  baseURL: UPSTREAM,
  endpoints: {
    read: endpoint.get("read").response<unknown>(),
    search: endpoint.get("search").variables<{ q: string }>().response<unknown>().cancelPrevious(),
    flaky: endpoint
      .get("flaky")
      .response<unknown>()
      .use(retryMiddleware({ delay: 10_000, jitter: "none" })),
    bounded: endpoint
      .get("read")
      .response<unknown>()
      .use(retryMiddleware({ deadline: 20 })),
  },
});

/* Once the request is out, so the cancellation meets it in flight. */
async function sent(): Promise<void> {
  await vi.waitFor(() => expect(upstream).toHaveBeenCalled());
}

beforeEach(() => {
  upstream.mockClear();
  vi.stubGlobal("fetch", upstream);
  registerSources({ api });
});

afterEach(() => {
  vi.unstubAllGlobals();
  _resetSourcesForTests();
});

describe("a direct call", () => {
  it("cancelled while its request is out rejects with an AbortError whose cause is the reason given", async () => {
    const controller = new AbortController();
    const reason = new Error("navigated away");
    const call = createCaller(api).with({ signal: controller.signal }).read();
    await sent();

    controller.abort(reason);

    const error: unknown = await call.catch((thrown: unknown) => thrown);
    expect(error).toBeInstanceOf(AbortError);
    expect(error).toMatchObject({
      code: "ABORTED",
      message: "The call was cancelled",
      cause: reason,
    });
  });

  it("cancelled with no reason keeps the platform's own as its cause", async () => {
    const controller = new AbortController();
    const call = createCaller(api).with({ signal: controller.signal }).read();
    await sent();

    controller.abort();

    const error: unknown = await call.catch((thrown: unknown) => thrown);
    expect(error).toBeInstanceOf(AbortError);
    expect((error as AbortError).cause).toMatchObject({ name: "AbortError" });
  });

  it("cancelled before it starts rejects with an AbortError", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      createCaller(api).with({ signal: controller.signal }).read(),
    ).rejects.toBeInstanceOf(AbortError);
  });

  it("cancelled while a middleware holds it between attempts rejects with an AbortError", async () => {
    const controller = new AbortController();
    const call = createCaller(api).with({ signal: controller.signal }).flaky();
    await sent();

    controller.abort();

    await expect(call).rejects.toMatchObject({ name: "AbortError", code: "ABORTED" });
    await expect(call).rejects.toBeInstanceOf(AbortError);
  });

  it("superseded by a newer call of its endpoint rejects with an AbortError SUPERSEDED", async () => {
    /* A newer call supersedes an older one only in a browser. */
    vi.stubGlobal("document", {});
    const client = createCaller(api);
    const first = client.search({ q: "a" }).catch((thrown: unknown) => thrown);
    await sent();

    await expect(client.search({ q: "ab" })).resolves.toEqual({ ok: true });

    const error = await first;
    expect(error).toBeInstanceOf(AbortError);
    expect(error).toMatchObject({
      code: "SUPERSEDED",
      message: "A newer call of the endpoint superseded this one",
    });
  });

  it("whose deadline ran out stays a TimeoutError", async () => {
    await expect(createCaller(api).bounded()).rejects.toMatchObject({
      name: "TimeoutError",
      scope: "deadline",
    });
    await expect(createCaller(api).bounded()).rejects.toBeInstanceOf(TimeoutError);
  });

  it("cancelled is told apart by isAbortError, is no RequestFailure and is not told to onError", async () => {
    const onError = vi.fn();
    const controller = new AbortController();
    const call = createCaller(api, { onError }).with({ signal: controller.signal }).read();
    await sent();

    controller.abort();

    const error: unknown = await call.catch((thrown: unknown) => thrown);
    expect(isAbortError(error)).toBe(true);
    expect(isRequestFailure(error)).toBe(false);
    expect(onError).not.toHaveBeenCalled();
  });
});

describe("a proxy client's call", () => {
  it("cancelled while its request is out rejects with an AbortError whose cause is the reason given", async () => {
    const controller = new AbortController();
    const reason = new Error("navigated away");
    const client = createProxyCaller(routesOf(api, "api")) as unknown as {
      with: (options: { signal: AbortSignal }) => { read: () => Promise<unknown> };
    };
    const call = client.with({ signal: controller.signal }).read();
    await sent();

    controller.abort(reason);

    const error: unknown = await call.catch((thrown: unknown) => thrown);
    expect(error).toBeInstanceOf(AbortError);
    expect(error).toMatchObject({ code: "ABORTED", cause: reason });
  });

  it("superseded by a newer call of its endpoint rejects with an AbortError SUPERSEDED", async () => {
    asBrowserPage();
    const client = createProxyCaller(routesOf(api, "api")) as unknown as {
      search: (variables: { q: string }) => Promise<unknown>;
    };
    const first = client.search({ q: "a" }).catch((thrown: unknown) => thrown);
    await sent();

    await client.search({ q: "ab" });

    expect(await first).toMatchObject({ name: "AbortError", code: "SUPERSEDED" });
  });
});

describe("a createFetch request", () => {
  it("cancelled while it is out rejects with an AbortError whose cause is the reason given", async () => {
    const controller = new AbortController();
    const reason = new Error("navigated away");
    const call = createFetch({ baseURL: UPSTREAM }).get("/read", { signal: controller.signal });
    await sent();

    controller.abort(reason);

    const error: unknown = await call.catch((thrown: unknown) => thrown);
    expect(error).toBeInstanceOf(AbortError);
    expect(error).toMatchObject({ code: "ABORTED", cause: reason });
  });
});
