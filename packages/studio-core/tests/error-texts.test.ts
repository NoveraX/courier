/**
 * An error's text, as a runtime tells Studio of it: as the app was told it
 * — the page that holds Studio's token shows it whole, and Studio cuts what
 * leaves that page — and no longer than an event carries, so a text that
 * holds a whole answer does not flood the socket.
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
const HUGE = "x".repeat(20_000);

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
  it("is the text the caller's error holds", async () => {
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
    expect(failure).toMatchObject({ error: { message: (caught as Error).message } });
    expect(String((caught as Error).message)).toContain("B34rer");
  });

  it("is a fetch's failure as it was, cut to the length an event carries", () => {
    const events = wired();

    studioHooks.onHttpFetchError?.({ requestId: "r1", message: REFUSED, timestamp: 1 });
    studioHooks.onHttpFetchError?.({ requestId: "r2", message: HUGE, timestamp: 2 });

    expect(events[0]).toMatchObject({ type: "http:fetch:error", message: REFUSED });
    expect(events[1]).toMatchObject({ message: `${"x".repeat(7999)}…` });
  });

  it("is a middleware's failure as it was", () => {
    const events = wired();

    studioHooks.onMiddlewareError?.({
      requestId: "r1",
      name: "auth",
      index: 0,
      phase: "request",
      error: "refused token=s3cret",
      timestamp: 1,
    });

    expect(events[0]).toMatchObject({ type: "middleware:error", error: "refused token=s3cret" });
  });

  it("is a stream's failure as it was, cut to the length an event carries", () => {
    const events = wired();

    studioHooks.onStreamError?.({ requestId: "r1", error: "closed Bearer B34rer", timestamp: 1 });
    studioHooks.onStreamError?.({ requestId: "r2", error: HUGE, timestamp: 2 });

    expect(events[0]).toMatchObject({ type: "stream:error", error: "closed Bearer B34rer" });
    expect(events[1]).toMatchObject({ error: `${"x".repeat(7999)}…` });
  });

  it("is a request's failure as it was, its kind and its cause kept", () => {
    const events = wired();

    studioHooks.onRequestError?.({
      id: "r1",
      error: {
        type: "network",
        message: REFUSED,
        cause: { code: "ConnectionRefused", message: "connect https://ana:pw@api.test/x" },
      },
      timestamp: 1,
    });

    expect(events[0]).toMatchObject({
      type: "request:error",
      error: {
        type: "network",
        message: REFUSED,
        cause: { code: "ConnectionRefused", message: "connect https://ana:pw@api.test/x" },
      },
    });
  });
});
