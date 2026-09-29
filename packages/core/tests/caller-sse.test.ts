import { describe, expect, it, vi } from "vitest";
import { createCaller } from "../src/caller";
import { defineApi, defineGroup } from "../src/define";
import { courier } from "../src/define/courier";
import { buildDirectSSEUrl, buildProxySSEUrl } from "../src/realtime/caller-sse";
import { subscribeSSE } from "../src/realtime/sse/sse-client";

const { endpoint, stream } = courier();

describe("buildDirectSSEUrl", () => {
  it("builds URL with baseURL, prefix and method", () => {
    const url = buildDirectSSEUrl("https://api.example.com", "notifications", "feed");
    expect(url).toBe("https://api.example.com/notifications/feed");
  });

  it("appends variables as query params", () => {
    const url = buildDirectSSEUrl("https://api.example.com", "notifications", "feed", {
      userId: "42",
      channel: "news",
    });
    expect(url).toBe("https://api.example.com/notifications/feed?userId=42&channel=news");
  });

  it("handles empty prefix (flat endpoints)", () => {
    const url = buildDirectSSEUrl("https://api.example.com", "", "healthStream");
    expect(url).toBe("https://api.example.com/healthStream");
  });

  it("strips trailing slash from baseURL", () => {
    const url = buildDirectSSEUrl("https://api.example.com/", "events", "stream");
    expect(url).toBe("https://api.example.com/events/stream");
  });

  it("strips leading slash from prefix", () => {
    const url = buildDirectSSEUrl("https://api.example.com", "/events", "stream");
    expect(url).toBe("https://api.example.com/events/stream");
  });

  it("joins a prefix that ends in a slash with one slash", () => {
    expect(buildDirectSSEUrl("https://api.example.com", "/api/", "events")).toBe(
      "https://api.example.com/api/events",
    );
    expect(buildDirectSSEUrl("https://api.example.com//", "events/", "/stream")).toBe(
      "https://api.example.com/events/stream",
    );
  });

  it("ends at the prefix for a stream at the group's root", () => {
    expect(buildDirectSSEUrl("https://api.example.com", "events", "")).toBe(
      "https://api.example.com/events",
    );
  });

  it("omits undefined and null variables", () => {
    const url = buildDirectSSEUrl("https://api.example.com", "events", "stream", {
      active: "true",
      filter: undefined,
      tag: null,
    });
    expect(url).toBe("https://api.example.com/events/stream?active=true");
  });

  it("encodes special characters in variable values", () => {
    const url = buildDirectSSEUrl("https://api.example.com", "search", "stream", {
      q: "hello world",
    });
    expect(url).toBe("https://api.example.com/search/stream?q=hello%20world");
  });

  it("repeats the key for each item of a list, as OpenAPI does by default", () => {
    const url = buildDirectSSEUrl("https://api.example.com", "", "stream", { tag: ["a", "b"] });
    expect(url).toBe("https://api.example.com/stream?tag=a&tag=b");
  });
});

describe("buildProxySSEUrl", () => {
  it("builds URL with source, group and method", () => {
    const url = buildProxySSEUrl("/api/sse", "myApi", "notifications", "feed");
    expect(url).toBe("/api/sse?_s=myApi&_m=feed&_g=notifications");
  });

  it("omits _g when group is empty", () => {
    const url = buildProxySSEUrl("/api/sse", "myApi", "", "healthStream");
    expect(url).toBe("/api/sse?_s=myApi&_m=healthStream");
  });

  it("sends the variables as one JSON parameter, keeping their types", () => {
    const url = buildProxySSEUrl("/api/sse", "api", "users", "activity", {
      userId: 1,
      kinds: ["login", "logout"],
    });
    const params = new URL(url, "http://localhost").searchParams;

    expect(params.get("_s")).toBe("api");
    expect(JSON.parse(params.get("_v") ?? "")).toEqual({ userId: 1, kinds: ["login", "logout"] });
    expect(params.has("userId")).toBe(false);
  });

  it("uses custom SSE URL", () => {
    const url = buildProxySSEUrl("/custom/sse", "api", "events", "stream");
    expect(url).toBe("/custom/sse?_s=api&_m=stream&_g=events");
  });
});

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

const mockedSubscribeSSE = vi.mocked(subscribeSSE);

describe("SSE transport detection — createCaller", () => {
  it("detects SSE endpoint and calls subscribeSSE", () => {
    const api = defineApi({
      baseURL: "https://api.example.com",
      groups: {
        notifications: defineGroup({
          prefix: "notifications",
          endpoints: {
            feed: stream.variables<{ userId: string }>().response<{ msg: string }>().get("feed"),
          },
        }),
      },
    });

    const client = createCaller(api);
    const result = (client as unknown as Record<string, Record<string, (v: unknown) => unknown>>)
      .notifications!.feed!({ userId: "42" });

    expect(result).toHaveProperty("close");
    expect(result).toHaveProperty("status", "connecting");
    expect(mockedSubscribeSSE).toHaveBeenCalledWith(
      "https://api.example.com/notifications/feed?userId=42",
      expect.objectContaining({ headers: expect.any(Object) }),
    );
  });

  it("falls through to HTTP for non-SSE endpoints", () => {
    mockedSubscribeSSE.mockClear();

    const api = defineApi({
      baseURL: "https://api.example.com",
      groups: {
        users: defineGroup({
          prefix: "users",
          endpoints: {
            getAll: endpoint.get("").response<string[]>(),
          },
        }),
      },
    });

    const client = createCaller(api);
    const result = (client as unknown as Record<string, Record<string, () => unknown>>).users!
      .getAll!();

    // HTTP returns a Promise, SSE was not called
    expect(result).toBeInstanceOf(Promise);
    expect(mockedSubscribeSSE).not.toHaveBeenCalled();

    // Suppress unhandled rejection (no real server)
    (result as Promise<unknown>).catch(() => {});
  });
});
