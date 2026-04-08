import { describe, expect, it } from "vitest";
import { buildSSECorsHeaders, formatSSEEvent, SSE_HEADERS, SSE_HEARTBEAT } from "../src/adapter/format-sse";

describe("formatSSEEvent", () => {
  it("formats simple data event", () => {
    const result = formatSSEEvent({ data: { hello: "world" } });
    expect(result).toBe('data: {"hello":"world"}\n\n');
  });

  it("includes id from event", () => {
    const result = formatSSEEvent({ id: "42", data: "test" });
    expect(result).toBe("id: 42\ndata: test\n\n");
  });

  it("uses seq as id when event has no id", () => {
    const result = formatSSEEvent({ data: "test" }, 7);
    expect(result).toBe("id: 7\ndata: test\n\n");
  });

  it("prefers event id over seq", () => {
    const result = formatSSEEvent({ id: "custom", data: "test" }, 99);
    expect(result).toBe("id: custom\ndata: test\n\n");
  });

  it("includes event type", () => {
    const result = formatSSEEvent({ event: "update", data: "x" });
    expect(result).toBe("event: update\ndata: x\n\n");
  });

  it("includes retry hint", () => {
    const result = formatSSEEvent({ data: "x", retry: 3000 });
    expect(result).toBe("retry: 3000\ndata: x\n\n");
  });

  it("handles multi-line string data", () => {
    const result = formatSSEEvent({ data: "line1\nline2\nline3" });
    expect(result).toBe("data: line1\ndata: line2\ndata: line3\n\n");
  });

  it("passes string data as-is without JSON wrapping", () => {
    const result = formatSSEEvent({ data: "plain" });
    expect(result).toBe("data: plain\n\n");
  });

  it("formats all fields together", () => {
    const result = formatSSEEvent({ id: "1", event: "msg", data: { x: 1 }, retry: 5000 });
    expect(result).toBe('id: 1\nevent: msg\nretry: 5000\ndata: {"x":1}\n\n');
  });
});

describe("SSE_HEADERS", () => {
  it("has correct content type", () => {
    expect(SSE_HEADERS["Content-Type"]).toBe("text/event-stream");
  });

  it("disables caching", () => {
    expect(SSE_HEADERS["Cache-Control"]).toBe("no-cache, no-transform");
  });

  it("disables nginx buffering", () => {
    expect(SSE_HEADERS["X-Accel-Buffering"]).toBe("no");
  });
});

describe("SSE_HEARTBEAT", () => {
  it("is a valid SSE comment", () => {
    expect(SSE_HEARTBEAT).toBe(": ping\n\n");
  });
});

describe("buildSSECorsHeaders", () => {
  it("returns CORS headers with Vary: Origin", () => {
    const headers = buildSSECorsHeaders("https://app.example.com");
    expect(headers["Access-Control-Allow-Origin"]).toBe("https://app.example.com");
    expect(headers["Vary"]).toBe("Origin");
    expect(headers["Access-Control-Allow-Credentials"]).toBe("true");
  });

  it("omits credentials header when disabled", () => {
    const headers = buildSSECorsHeaders("https://app.example.com", false);
    expect(headers["Access-Control-Allow-Origin"]).toBe("https://app.example.com");
    expect(headers["Vary"]).toBe("Origin");
    expect(headers["Access-Control-Allow-Credentials"]).toBeUndefined();
  });

  it("passes wildcard origin through", () => {
    const headers = buildSSECorsHeaders("*");
    expect(headers["Access-Control-Allow-Origin"]).toBe("*");
  });
});
