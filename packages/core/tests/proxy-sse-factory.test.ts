/**
 * Unit tests for `createProxySSEFactory`.
 *
 * Mocks `subscribeSSE` at the module boundary so we exercise the factory's
 * URL-building, header merging, and dispatch logic without opening real
 * network connections. URL assertions match by suffix because
 * `resolveProxyPath` returns an absolute URL based on the test runner's
 * `location.host`.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/realtime/sse/sse-client", () => ({
  subscribeSSE: vi.fn(() => ({
    [Symbol.asyncIterator]: () => ({
      next: () => Promise.resolve({ done: true, value: undefined }),
    }),
    close: vi.fn(),
    status: "connecting" as const,
    on: vi.fn(),
  })),
}));

import { subscribeSSE } from "../src/realtime/sse/sse-client";
import { createProxySSEFactory } from "../src/transport/proxy/sse";

const mockedSubscribeSSE = vi.mocked(subscribeSSE);

beforeEach(() => {
  (globalThis as { location?: { protocol: string; host: string } }).location = {
    protocol: "https:",
    host: "app.example.com",
  };
});

afterEach(() => {
  mockedSubscribeSSE.mockClear();
});

describe("createProxySSEFactory", () => {
  it("returns a callable factory", () => {
    const factory = createProxySSEFactory("api");
    expect(typeof factory).toBe("function");
  });

  it("uses default sse path /api/sse when proxyPath omitted", () => {
    const factory = createProxySSEFactory("api");
    factory("notifications", "feed", undefined, {});

    const url = mockedSubscribeSSE.mock.calls[0]![0];
    expect(url).toBe("https://app.example.com/api/sse?_s=api&_m=feed&_g=notifications");
  });

  it("uses custom proxyPath.sse when specified", () => {
    const factory = createProxySSEFactory("api", { proxyPath: { sse: "/custom/stream" } });
    factory("chat", "messages", undefined, {});

    const url = mockedSubscribeSSE.mock.calls[0]![0];
    expect(url).toBe("https://app.example.com/custom/stream?_s=api&_m=messages&_g=chat");
  });

  it("uses absolute proxyPath.sse as-is (cross-origin SSE)", () => {
    const factory = createProxySSEFactory("api", {
      proxyPath: { sse: "https://realtime.example.com/sse" },
    });
    factory("chat", "messages", undefined, {});

    const url = mockedSubscribeSSE.mock.calls[0]![0];
    expect(url).toBe("https://realtime.example.com/sse?_s=api&_m=messages&_g=chat");
  });

  it("omits _g query param when group is empty (flat endpoint)", () => {
    const factory = createProxySSEFactory("api");
    factory("", "healthStream", undefined, {});

    const url = mockedSubscribeSSE.mock.calls[0]![0];
    expect(url).toBe("https://app.example.com/api/sse?_s=api&_m=healthStream");
  });

  it("appends the variables as one JSON parameter after the meta params", () => {
    const factory = createProxySSEFactory("api");
    factory("users", "activity", { userId: 42, channel: "news" }, {});

    const url = mockedSubscribeSSE.mock.calls[0]![0];
    expect(url).toBe(
      `https://app.example.com/api/sse?_s=api&_m=activity&_g=users&_v=${encodeURIComponent('{"userId":42,"channel":"news"}')}`,
    );
  });

  it("forwards default headers from the factory configuration", () => {
    const factory = createProxySSEFactory("api", {
      headers: { authorization: "Bearer token" },
    });
    factory("notifications", "feed", undefined, {});

    expect(mockedSubscribeSSE).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ authorization: "Bearer token" }),
      }),
    );
  });

  it("merges per-call headers with defaults (per-call wins on conflict)", () => {
    const factory = createProxySSEFactory("api", {
      headers: { authorization: "Bearer default", "x-custom": "default" },
    });
    factory("chat", "messages", undefined, {
      headers: { authorization: "Bearer override" },
    });

    expect(mockedSubscribeSSE).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: {
          authorization: "Bearer override",
          "x-custom": "default",
        },
      }),
    );
  });

  it("returns the SSESubscription produced by subscribeSSE", () => {
    const factory = createProxySSEFactory("api");
    const subscription = factory("chat", "messages", undefined, {});

    expect(subscription).toHaveProperty("close");
    expect(subscription).toHaveProperty("status", "connecting");
    expect(typeof subscription[Symbol.asyncIterator]).toBe("function");
  });

  it("encodes special characters in variable values", () => {
    const factory = createProxySSEFactory("api");
    factory("search", "stream", { q: "hello world" }, {});

    const url = mockedSubscribeSSE.mock.calls[0]![0];
    const params = new URL(url).searchParams;
    expect(JSON.parse(params.get("_v") ?? "")).toEqual({ q: "hello world" });
  });

  it("works with no defaults and no per-call headers (empty headers object)", () => {
    const factory = createProxySSEFactory("api");
    factory("notifications", "feed", undefined, {});

    expect(mockedSubscribeSSE).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ headers: {} }),
    );
  });

  it("uses explicit origin when provided (Node / SSR scenario)", () => {
    // Simulate Node where globalThis.location is undefined
    delete (globalThis as { location?: unknown }).location;

    const factory = createProxySSEFactory("api", {
      proxyPath: { sse: "/api/sse" },
      origin: { protocol: "http:", host: "localhost:3000" },
    });
    factory("notifications", "feed", undefined, {});

    const url = mockedSubscribeSSE.mock.calls[0]![0];
    expect(url).toBe("http://localhost:3000/api/sse?_s=api&_m=feed&_g=notifications");

    // Restore for subsequent tests
    (globalThis as { location?: { protocol: string; host: string } }).location = {
      protocol: "https:",
      host: "app.example.com",
    };
  });

  it("explicit origin takes precedence over globalThis.location", () => {
    const factory = createProxySSEFactory("api", {
      proxyPath: { sse: "/api/sse" },
      origin: { protocol: "http:", host: "127.0.0.1:8080" },
    });
    factory("notifications", "feed", undefined, {});

    const url = mockedSubscribeSSE.mock.calls[0]![0];
    expect(url).toBe("http://127.0.0.1:8080/api/sse?_s=api&_m=feed&_g=notifications");
  });
});
