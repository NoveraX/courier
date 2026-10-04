/**
 * The answer a runtime tells Studio a fetch got carries the HTTP version it
 * came over, when the runtime could tell one, and nothing in its place when
 * it could not.
 */
import { studioHooks } from "@noverax/courier/internal";
import { afterEach, describe, expect, it } from "vitest";

import { EventBus } from "../src/event-bus";
import type { AnyStudioEvent } from "../src/events";
import { wireFetchHooks } from "../src/runtime/hooks/http-fetch";

afterEach(() => {
  delete studioHooks.onHttpFetchStart;
  delete studioHooks.onHttpFetchEnd;
  delete studioHooks.onHttpFetchError;
});

function wired(url: string, version: "HTTP/2" | undefined): AnyStudioEvent[] {
  const bus = new EventBus();
  const events: AnyStudioEvent[] = [];
  bus.on((event) => events.push(event));
  wireFetchHooks(bus, "runtime", {
    versionOf: (asked) => (asked === url ? version : undefined),
    dispose: () => {},
  });
  studioHooks.onHttpFetchStart?.({ requestId: "r1", timestamp: 1, url, method: "GET" });
  return events;
}

function fetched(url: string, version: "HTTP/2" | undefined): AnyStudioEvent[] {
  const events = wired(url, version);
  studioHooks.onHttpFetchEnd?.({ requestId: "r1", timestamp: 2, status: 200, duration: 1 });
  return events;
}

describe("a fetch's answer", () => {
  it("carries the HTTP version it came over", () => {
    const end = fetched("https://api.example.com/users", "HTTP/2").find(
      (e) => e.type === "http:fetch:end",
    );

    expect(end).toMatchObject({ requestId: "r1", httpVersion: "HTTP/2" });
  });

  it("carries none when the runtime could not tell", () => {
    const end = fetched("https://api.example.com/users", undefined).find(
      (e) => e.type === "http:fetch:end",
    );

    expect(end).toBeDefined();
    expect(end).not.toHaveProperty("httpVersion");
  });
});

describe("a fetch's failure", () => {
  it("carries the HTTP version of the answer that failed it", () => {
    const events = wired("https://api.example.com/users", "HTTP/2");
    studioHooks.onHttpFetchError?.({
      requestId: "r1",
      timestamp: 2,
      message: "HTTP 404",
      status: 404,
    });

    expect(events.find((e) => e.type === "http:fetch:error")).toMatchObject({
      status: 404,
      httpVersion: "HTTP/2",
    });
  });

  it("carries none when no answer came", () => {
    const events = wired("https://api.example.com/users", "HTTP/2");
    studioHooks.onHttpFetchError?.({ requestId: "r1", timestamp: 2, message: "fetch failed" });

    const failure = events.find((e) => e.type === "http:fetch:error");
    expect(failure).toBeDefined();
    expect(failure).not.toHaveProperty("httpVersion");
  });
});
