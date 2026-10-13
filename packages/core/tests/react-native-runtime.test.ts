/**
 * A client in a React Native app. Its AbortController keeps no reason; its
 * fetch reports a cancellation and a timeout alike — as an abort, or, from
 * expo/fetch, as a plain error saying the fetch failed; and without Expo it
 * has no AbortSignal.any or AbortSignal.timeout, no crypto, no
 * structuredClone, no DOMException and no page to resolve a path against.
 * Each test takes away what React Native lacks, and the call still says
 * what happened to it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createCaller } from "../src/caller";
import { courier, defineApi } from "../src/define/index";
import { ConfigurationError, HTTPError } from "../src/errors";
import { cacheMiddleware } from "../src/middleware/cache";
import type { MiddlewareContext, WrapHandler } from "../src/middleware/types";
import { subscribeSSE } from "../src/realtime/sse";
import { createWSConnection } from "../src/realtime/ws/ws-connection";
import { isAbortError } from "../src/utils/abort";

const { endpoint } = courier();
const restores: Array<() => void> = [];

function api(baseURL = "https://api.example") {
  return defineApi({
    baseURL,
    cancelPrevious: ["slow"],
    endpoints: {
      slow: endpoint.get("slow").response<unknown>(),
      order: endpoint
        .post("orders", { idempotencyKey: "header:Idempotency-Key" })
        .variables<{ item: string }>()
        .response<unknown>(),
      upload: endpoint.post("files").variables<FormData>().response<unknown>(),
    },
  });
}

/** Take a static off a constructor for one test, as React Native lacks it. */
function without(target: object, key: string): void {
  const own = Object.getOwnPropertyDescriptor(target, key);
  Object.defineProperty(target, key, { value: undefined, configurable: true, writable: true });
  restores.push(() => {
    if (own) Object.defineProperty(target, key, own);
  });
}

/** An AbortController as React Native's: `abort()` drops the reason it is given. */
class ReasonlessAbortController extends AbortController {
  constructor() {
    super();
    Object.defineProperty(this.signal, "reason", { get: () => undefined });
  }
}

/** A fetch that answers after a pause, and rejects as `rejectWith` says once its signal aborts. */
function pausingFetch(rejectWith: () => unknown): typeof fetch {
  return (_input, init) =>
    new Promise((resolve, reject) => {
      const signal = init?.signal;
      if (signal?.aborted) return reject(rejectWith());
      const timer = setTimeout(() => resolve(Response.json({ ok: true })), 200);
      signal?.addEventListener("abort", () => {
        clearTimeout(timer);
        reject(rejectWith());
      });
    });
}

/* expo/fetch rejects a cancelled request as a FetchError, a plain Error. */
const expoFetch = () => pausingFetch(() => new Error("fetch failed: The operation was aborted."));
/* React Native's own fetch rejects any abort, a timeout's too, as an AbortError. */
const nativeFetch = () => pausingFetch(() => new DOMException("Aborted", "AbortError"));

async function rejection(call: Promise<unknown>): Promise<unknown> {
  return call.then(
    () => "resolved",
    (error: unknown) => error,
  );
}

beforeEach(() => {
  /* No page: the test setup gives every suite a location, React Native has none. */
  vi.stubGlobal("location", undefined);
  vi.stubGlobal("navigator", { product: "ReactNative" });
  vi.stubGlobal("AbortController", ReasonlessAbortController);
});

afterEach(() => {
  for (const restore of restores.splice(0).reverse()) restore();
  vi.unstubAllGlobals();
});

describe("a call cancelled in React Native", () => {
  it.each([
    ["expo/fetch", expoFetch],
    ["React Native's fetch", nativeFetch],
  ])(
    "rejects with an AbortError through %s, though the signal kept no reason",
    async (_name, fetch) => {
      vi.stubGlobal("fetch", fetch());
      const controller = new AbortController();
      const pending = rejection(createCaller(api()).slow.with({ signal: controller.signal })());

      controller.abort();

      expect(isAbortError(await pending)).toBe(true);
    },
  );

  it("rejects with an error named AbortError where the runtime has no DOMException", async () => {
    vi.stubGlobal("fetch", expoFetch());
    vi.stubGlobal("DOMException", undefined);
    const controller = new AbortController();
    const pending = rejection(createCaller(api()).slow.with({ signal: controller.signal })());

    controller.abort();
    const error = await pending;

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).name).toBe("AbortError");
  });
});

describe("a call that times out in React Native", () => {
  it("is a timeout, though fetch reported only an abort", async () => {
    vi.stubGlobal("fetch", nativeFetch());

    const error = await rejection(createCaller(api()).slow.with({ timeout: 20 })());

    expect(error).toBeInstanceOf(HTTPError);
    expect(error).toMatchObject({ status: 0, message: "Request timed out" });
    expect((error as HTTPError).data).toMatchObject({ code: "TIMEOUT" });
    expect(((error as HTTPError).cause as Error).name).toBe("TimeoutError");
  });

  it("is a timeout where AbortSignal.timeout is missing", async () => {
    vi.stubGlobal("fetch", nativeFetch());
    without(AbortSignal, "timeout");

    const error = await rejection(createCaller(api()).slow.with({ timeout: 20 })());

    expect(error).toMatchObject({ status: 0, message: "Request timed out" });
  });
});

describe("cancelling the previous call in React Native", () => {
  it("cancels a superseded read, as in a browser, where AbortSignal.any is missing", async () => {
    vi.stubGlobal("fetch", nativeFetch());
    without(AbortSignal, "any");
    const client = createCaller(api());
    const controller = new AbortController();

    const first = rejection(client.slow.with({ signal: controller.signal })());
    const second = client.slow.with({ signal: controller.signal })();

    expect(isAbortError(await first)).toBe(true);
    await expect(second).resolves.toEqual({ ok: true });
  });
});

describe("an idempotency key in React Native", () => {
  it("is a UUID, made without crypto", async () => {
    let sent: string | null = null;
    vi.stubGlobal("crypto", undefined);
    vi.stubGlobal("fetch", (_input: unknown, init?: RequestInit) => {
      sent = new Headers(init?.headers).get("idempotency-key");
      return Promise.resolve(Response.json({}));
    });

    await createCaller(api()).order({ item: "lamp" });

    expect(sent).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

describe("a cached answer in React Native", () => {
  it("is served as a copy where the runtime has no structuredClone", async () => {
    vi.stubGlobal("structuredClone", undefined);
    const handler = cacheMiddleware({ scope: "public", ttl: 5_000 }).handler as WrapHandler;
    const context: MiddlewareContext = {
      source: "api",
      group: "users",
      method: "list",
      headers: new Headers(),
      kind: "query",
    };
    let calls = 0;
    const next = () => {
      calls++;
      return Promise.resolve({ status: 200, headers: new Headers(), data: { users: ["ada"] } });
    };

    const first = await handler(context, next);
    (first.data as { users: string[] }).users.push("edited");
    const second = await handler(context, next);

    expect(calls).toBe(1);
    expect(second.data).toEqual({ users: ["ada"] });
  });
});

describe("an address that is only a path, in React Native", () => {
  it("is refused with what to give instead, before any request", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);

    const error = await rejection(createCaller(api("/api")).slow());

    expect(error).toBeInstanceOf(ConfigurationError);
    expect(error).toMatchObject({ code: "URL_NOT_ABSOLUTE" });
    expect((error as Error).message).toContain("http://10.0.2.2:3000/api");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("is sent as it is from a page, which resolves it", async () => {
    vi.stubGlobal("location", { protocol: "https:", host: "app.example" });
    const fetch = vi.fn(() => Promise.resolve(Response.json({ ok: true })));
    vi.stubGlobal("fetch", fetch);

    await createCaller(api("/api")).slow();

    expect(fetch).toHaveBeenCalledWith("/api/slow", expect.anything());
  });

  it("is refused for a stream and a socket as well", () => {
    expect(() => subscribeSSE("/api/sse")).toThrow(ConfigurationError);
    expect(() => createWSConnection({ url: "/api/ws" })).toThrow(ConfigurationError);
  });
});

/** FormData as Expo patches it: it lists its entries, a device file among them as appended. */
class ExpoFormData {
  readonly parts: Array<[string, unknown]> = [];
  append(name: string, value: unknown): void {
    this.parts.push([name, value]);
  }
  entries(): IterableIterator<[string, unknown]> {
    return this.parts[Symbol.iterator]();
  }
}

/** React Native's XMLHttpRequest, as far as an upload uses it: it answers each request with JSON. */
class RecordingXhr {
  static sent: unknown[] = [];
  readonly upload = { addEventListener: () => undefined };
  readonly listeners = new Map<string, () => void>();
  responseType = "";
  withCredentials = false;
  status = 0;
  statusText = "";
  response: unknown = null;
  open(): void {}
  setRequestHeader(): void {}
  addEventListener(type: string, listener: () => void): void {
    this.listeners.set(type, listener);
  }
  getAllResponseHeaders(): string {
    return "content-type: application/json\r\n";
  }
  send(body: unknown): void {
    RecordingXhr.sent.push(body);
    this.status = 200;
    this.response = new TextEncoder().encode('{"stored":true}').buffer;
    queueMicrotask(() => this.listeners.get("load")?.());
  }
}

describe("an upload in React Native", () => {
  it("sends a form naming a file on the device through XMLHttpRequest, which reads it", async () => {
    RecordingXhr.sent = [];
    const fetch = vi.fn();
    vi.stubGlobal("FormData", ExpoFormData);
    vi.stubGlobal("XMLHttpRequest", RecordingXhr);
    vi.stubGlobal("fetch", fetch);
    const form = new ExpoFormData();
    form.append("photo", { uri: "file:///photo.jpg", name: "photo.jpg", type: "image/jpeg" });

    /* The global FormData is Expo's here; the DOM's type knows no device file. */
    const stored = await createCaller(api()).upload(form as unknown as FormData);

    expect(stored).toEqual({ stored: true });
    expect(RecordingXhr.sent).toEqual([form]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("sends a form of bytes with the app's fetch", async () => {
    const fetch = vi.fn(() => Promise.resolve(Response.json({ stored: true })));
    vi.stubGlobal("XMLHttpRequest", RecordingXhr);
    vi.stubGlobal("fetch", fetch);
    const form = new FormData();
    form.append("note", new Blob(["hello"], { type: "text/plain" }), "note.txt");

    await createCaller(api()).upload(form);

    expect(fetch).toHaveBeenCalledOnce();
  });
});

describe("a call in React Native, which has no streams", () => {
  it("is sent and answered", async () => {
    /* Made first: Node's Response is built on the streams React Native lacks. */
    const answer = Response.json({ ok: true });
    vi.stubGlobal("ReadableStream", undefined);
    vi.stubGlobal("fetch", () => Promise.resolve(answer));

    await expect(createCaller(api()).slow()).resolves.toEqual({ ok: true });
  });
});
