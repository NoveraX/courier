/**
 * An error's text, as a runtime tells Studio of it, holds nothing that
 * could be a credential — while the error the caller receives keeps it
 * whole. A header value read from a file or the environment with its line
 * break fails with an error that quotes the value.
 */
import { createCaller } from "@noverax/courier";
import { courier, defineApi } from "@noverax/courier/define";
import { createKeptBodies, studioHooks } from "@noverax/courier/internal";
import { afterEach, describe, expect, it } from "vitest";

import { EventBus } from "../src/event-bus";
import type { AnyStudioEvent } from "../src/events";
import { wireFetchHooks } from "../src/runtime/hooks/http-fetch";
import { wireMiddlewareHooks } from "../src/runtime/hooks/middleware";
import { wireRequestHooks } from "../src/runtime/hooks/request";
import { wireStreamHooks } from "../src/runtime/hooks/stream";

const { endpoint } = courier();
const REFUSED = 'Headers.append: "Bearer B34rer\nx" is an invalid header value.';
const SHOWN = 'Headers.append: "[redacted]" is an invalid header value.';

function wired(): AnyStudioEvent[] {
  const bus = new EventBus();
  const events: AnyStudioEvent[] = [];
  bus.on((event) => events.push(event));
  wireRequestHooks(bus, "app", (name) => name, createKeptBodies());
  wireFetchHooks(bus, "app", { versionOf: () => undefined, dispose: () => {} });
  wireMiddlewareHooks(bus, "app");
  wireStreamHooks(bus, "app", (name) => name);
  return events;
}

afterEach(() => {
  for (const key of Object.keys(studioHooks) as Array<keyof typeof studioHooks>) {
    if (key.startsWith("on")) delete studioHooks[key];
  }
});

describe("an error's text, as Studio is told it", () => {
  it("names no token of a header value the platform refused, while the caller's error does", async () => {
    const events = wired();
    const api = defineApi({
      expose: true,
      baseURL: "http://127.0.0.1:1",
      headers: { authorization: "Bearer B34rer\nx" },
      endpoints: { me: endpoint.get("me").response<unknown>() },
    });

    const caught = await createCaller(api)
      .me()
      .catch((error: unknown) => error);

    const failure = events.find((event) => event.type === "request:error");
    expect(failure).toBeDefined();
    expect(JSON.stringify(events)).not.toContain("B34rer");
    expect(String((caught as Error).message)).toContain("B34rer");
  });

  it("cuts it from a fetch's failure", () => {
    const events = wired();

    studioHooks.onHttpFetchError?.({ requestId: "r1", message: REFUSED, timestamp: 1 });

    expect(events[0]).toMatchObject({ type: "http:fetch:error", message: SHOWN });
  });

  it("cuts it from a middleware's failure", () => {
    const events = wired();

    studioHooks.onMiddlewareError?.({
      requestId: "r1",
      name: "auth",
      index: 0,
      phase: "request",
      error: "refused token=s3cret",
      timestamp: 1,
    });

    expect(events[0]).toMatchObject({
      type: "middleware:error",
      error: "refused token=[redacted]",
    });
  });

  it("cuts it from a stream's failure", () => {
    const events = wired();

    studioHooks.onStreamError?.({ requestId: "r1", error: "closed Bearer B34rer", timestamp: 1 });

    expect(events[0]).toMatchObject({ type: "stream:error", error: "closed Bearer [redacted]" });
  });

  it("cuts it from a request's failure, its kind kept", () => {
    const events = wired();

    studioHooks.onRequestError?.({
      id: "r1",
      error: { type: "unknown", message: REFUSED },
      timestamp: 1,
    });

    expect(events[0]).toMatchObject({
      type: "request:error",
      error: { type: "unknown", message: SHOWN },
    });
  });
});
