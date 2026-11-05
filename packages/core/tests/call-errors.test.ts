/**
 * What a call that got no successful answer fails with, told apart by what
 * happened rather than by a status: an `HTTPError` holds an answer, and its
 * status is one an answer has; a `NetworkError`, a request that got none; a
 * `TimeoutError`, one whose time ran out — each with a stable code, a name
 * a minifier keeps, and a message that names no host.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { createCaller } from "../src/caller";
import { courier, defineApi } from "../src/define/index";
import {
  ConfigurationError,
  CourierError,
  HTTPError,
  isNetworkError,
  isRequestFailure,
  isTimeoutError,
  NetworkError,
  TimeoutError,
} from "../src/errors";
import { ValidationError } from "../src/validation";

const { endpoint } = courier();

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("a NetworkError", () => {
  it("names the platform's code in its message and nothing else, its cause what the platform said", () => {
    const refused = new TypeError("fetch failed", {
      cause: Object.assign(new Error("connect ECONNREFUSED 10.0.0.5:443"), {
        code: "ECONNREFUSED",
      }),
    });

    const error = new NetworkError({ cause: refused, systemCode: "ECONNREFUSED" });

    expect(error).toBeInstanceOf(CourierError);
    expect(error).toMatchObject({
      name: "NetworkError",
      code: "NETWORK_ERROR",
      systemCode: "ECONNREFUSED",
      message: "Network request failed (ECONNREFUSED)",
    });
    expect(error.message).not.toContain("10.0.0.5");
    expect(error.cause).toBe(refused);
  });

  it("says only that the request failed where the platform gave no code, as a browser's does", () => {
    expect(new NetworkError({ cause: new TypeError("Failed to fetch") })).toMatchObject({
      systemCode: undefined,
      message: "Network request failed",
    });
  });
});

describe("a TimeoutError", () => {
  it("says which time ran out, and how long it was", () => {
    expect(new TimeoutError({ scope: "attempt", timeout: 5_000 })).toMatchObject({
      name: "TimeoutError",
      code: "TIMEOUT",
      scope: "attempt",
      timeout: 5_000,
      message: "Request timed out after 5000 ms",
    });
    expect(new TimeoutError({ scope: "deadline", timeout: 10_000 }).message).toBe(
      "Call deadline exceeded after 10000 ms",
    );
    expect(new TimeoutError({ scope: "attempt" }).message).toBe("Request timed out");
  });
});

describe("an HTTPError", () => {
  it.each([100, 404, 599])("holds an answer's status, %i", (status) => {
    expect(new HTTPError({ status, headers: new Headers(), data: null }).status).toBe(status);
  });

  it.each([0, 99, 600, Number.NaN])("refuses a status no answer has, %d", (status) => {
    expect(() => new HTTPError({ status, headers: new Headers(), data: null })).toThrow(RangeError);
  });
});

describe("the type guards", () => {
  it("tell each failure by its class, and a request failure from what is none", () => {
    const network = new NetworkError();
    const timeout = new TimeoutError({ scope: "attempt" });
    const answered = new HTTPError({ status: 503, headers: new Headers(), data: null });

    expect([network, timeout, answered].map(isRequestFailure)).toEqual([true, true, true]);
    expect(isNetworkError(network) && !isNetworkError(timeout)).toBe(true);
    expect(isTimeoutError(timeout) && !isTimeoutError(answered)).toBe(true);
    expect(
      [
        new ConfigurationError("URL_NOT_ABSOLUTE", "a path"),
        new ValidationError("response", []),
        new DOMException("The operation was aborted", "AbortError"),
        new TypeError("fetch failed"),
      ].map(isRequestFailure),
    ).toEqual([false, false, false, false]);
  });
});

describe("an answer the browser hides", () => {
  it("is refused as a misconfiguration, not taken for an answer of status 0", async () => {
    const opaque = { type: "opaque", ok: false, status: 0, headers: new Headers(), body: null };
    vi.stubGlobal("fetch", () => Promise.resolve(opaque));
    const client = createCaller(
      defineApi({
        name: "api",
        baseURL: "https://api.test",
        endpoints: { read: endpoint.get("x") },
      }),
    );

    const error: unknown = await client.read().catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(ConfigurationError);
    expect(error).toMatchObject({ code: "RESPONSE_OPAQUE" });
  });
});
