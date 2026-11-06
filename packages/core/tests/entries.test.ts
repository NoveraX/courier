/**
 * What each entry offers. The client entry is what a page takes: the
 * callers, the errors a call fails with and the helpers a page uses with
 * them. The server entry is what a server takes: its handlers, its caller
 * and what an adapter registers, with the errors and helpers server code
 * uses beside them. The root offers both, and nothing either does not.
 */
import { describe, expect, it } from "vitest";

import * as root from "../src";
import * as client from "../src/client";
import * as server from "../src/server";

/* A server's own types are not a page's: naming one from the client entry does not compile. */
// @ts-expect-error not exported
export type NoHandlerConfig = client.HandlerConfig;
// @ts-expect-error not exported
export type NoIncomingRequest = client.IncomingRequest;
export type ServerHandlerConfig = server.HandlerConfig;
export type ServerCallerDefaults = server.CallerDefaults;
export type ClientCallerDefaults = client.CallerDefaults;

const SHARED = [
  "AbortError",
  "ConfigurationError",
  "ConnectionError",
  "CourierError",
  "HTTPError",
  "MissingTokenError",
  "NetworkError",
  "RealtimeError",
  "TimeoutError",
  "ValidationError",
  "createCaller",
  "createLogger",
  "createProxyCaller",
  "defineMiddleware",
  "isAbortError",
  "isCallFailure",
  "isConfigurationError",
  "isCourierError",
  "isHTTPError",
  "isMissingTokenError",
  "isNetworkError",
  "isRequestFailure",
  "isStreamedUpload",
  "isTimeoutError",
  "isValidationError",
  "logger",
  "redact",
];

const PAGE_ONLY = ["createFetch", "smoothProgress"];

const SERVER_ONLY = [
  "createHandler",
  "createWSHandler",
  "detectAppOrigin",
  "ensureCsrfToken",
  "getAppOrigin",
  "getSources",
  "handleWhileConnected",
  "memoryRateLimitStore",
  "registerRequestContext",
  "registerSources",
  "setAppOrigin",
];

const sorted = (names: readonly string[]) => [...names].sort();

describe("the client entry", () => {
  it("offers the callers, the errors and the helpers a page uses", () => {
    expect(sorted(Object.keys(client))).toEqual(sorted([...SHARED, ...PAGE_ONLY]));
  });
});

describe("the server entry", () => {
  it("offers the handlers, the server's caller and what an adapter registers", () => {
    expect(sorted(Object.keys(server))).toEqual(sorted([...SHARED, ...SERVER_ONLY]));
  });
});

describe("the root", () => {
  it("offers what the client and the server entries do, and nothing more", () => {
    expect(sorted(Object.keys(root))).toEqual(
      sorted([...new Set([...Object.keys(client), ...Object.keys(server)])]),
    );
  });

  it("offers the very bindings the entries do", () => {
    for (const [name, value] of Object.entries(server)) {
      expect(Reflect.get(root, name), name).toBe(value);
    }
    for (const [name, value] of Object.entries(client)) {
      if (name !== "createCaller") expect(Reflect.get(root, name), name).toBe(value);
    }
  });

  it("makes its callers with the server's caller, which a page's leaves out", () => {
    expect(root.createCaller).toBe(server.createCaller);
    expect(client.createCaller).not.toBe(server.createCaller);
  });
});
