import { describe, expect, it } from "vitest";

import { buildDirectSSEUrl, buildProxySSEUrl } from "../src/realtime/sse-address";

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
