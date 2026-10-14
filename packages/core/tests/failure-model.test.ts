/**
 * How a call fails when there is no answer, as the documentation describes
 * it: a network failure or timeout is an HTTPError with status 0, and a
 * cancellation the caller asked for is rethrown as fetch rejected it.
 *
 * Direct mode and the proxy client fail alike: never a 502 from a gateway
 * that is not there, and never a bare TypeError that `isHTTPError` rejects
 * and `onError` does not see.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { createCaller } from "../src/caller";
import { courier, defineApi } from "../src/define/index";
import { routesOf } from "../src/define/routes-of";
import { HTTPError, isHTTPError } from "../src/errors";
import { createProxyCaller } from "../src/proxy-caller";

const { endpoint } = courier();
const api = defineApi({
  baseURL: "https://upstream.example",
  expose: true,
  endpoints: { list: endpoint.get("list").response<unknown>() },
});

interface Client {
  list: (() => Promise<unknown>) & {
    with: (options: { signal?: AbortSignal }) => () => Promise<unknown>;
  };
}

/** A fetch that never answers until its request is cancelled. */
function hangingFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const signal = input instanceof Request ? input.signal : init?.signal;
  return new Promise((_resolve, reject) => {
    /* As real fetch does, a signal already aborted rejects at once. */
    if (signal?.aborted) reject(signal.reason);
    signal?.addEventListener("abort", () => reject(signal.reason));
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe.each([
  ["direct", () => createCaller(api) as unknown as Client],
  ["proxy", () => createProxyCaller(routesOf(api, "api")) as unknown as Client],
])("%s mode", (_mode, makeClient) => {
  it("reports a network failure as an HTTPError with status 0 and its cause", async () => {
    const cause = new TypeError("fetch failed");
    vi.stubGlobal("fetch", async () => {
      throw cause;
    });

    const error = await makeClient()
      .list()
      .catch((e: unknown) => e);

    expect(isHTTPError(error)).toBe(true);
    expect((error as HTTPError).status).toBe(0);
    expect((error as HTTPError).cause).toBe(cause);
  });

  it("rethrows a cancellation the caller asked for as an AbortError", async () => {
    vi.stubGlobal("fetch", hangingFetch);
    const controller = new AbortController();

    const pending = makeClient().list.with({ signal: controller.signal })();
    controller.abort();
    const error = await pending.catch((e: unknown) => e);

    expect(error).toBeInstanceOf(DOMException);
    expect((error as DOMException).name).toBe("AbortError");
  });
});

describe("the proxy client's onError", () => {
  it("sees a network failure", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("fetch failed");
    });
    const onError = vi.fn();

    await (createProxyCaller(routesOf(api, "api"), { onError }) as unknown as Client)
      .list()
      .catch(() => undefined);

    expect(onError).toHaveBeenCalledWith(expect.any(HTTPError));
  });
});
