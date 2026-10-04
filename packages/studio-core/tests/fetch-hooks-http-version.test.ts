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

function fetched(url: string, version: "HTTP/2" | undefined): AnyStudioEvent[] {
  const bus = new EventBus();
  const events: AnyStudioEvent[] = [];
  bus.on((event) => events.push(event));
  wireFetchHooks(bus, "runtime", {
    versionOf: (asked) => (asked === url ? version : undefined),
    dispose: () => {},
  });
  studioHooks.onHttpFetchStart?.({ requestId: "r1", timestamp: 1, url, method: "GET" });
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
