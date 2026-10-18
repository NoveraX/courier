/**
 * How a stream's connection stands, as a runtime tells Studio of it: being
 * opened, open, being opened again with why the last one ended — the
 * platform's code and text, in the shape a request's cause takes.
 */
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { createCaller } from "@noverax/courier";
import { courier, defineApi } from "@noverax/courier/define";
import { studioHooks } from "@noverax/courier/internal";
import { afterEach, describe, expect, it } from "vitest";

import { EventBus } from "../src/event-bus";
import type { AnyStudioEvent } from "../src/events";
import { wireStreamHooks } from "../src/runtime/hooks/stream";

const { stream, channel } = courier();
const closers: Array<() => void> = [];

function wired(): AnyStudioEvent[] {
  const bus = new EventBus();
  const events: AnyStudioEvent[] = [];
  bus.on((event) => events.push(event));
  wireStreamHooks(bus, "app", (name) => name);
  return events;
}

afterEach(() => {
  for (const close of closers.splice(0)) close();
  for (const key of Object.keys(studioHooks) as Array<keyof typeof studioHooks>) {
    if (key.startsWith("on")) delete studioHooks[key];
  }
});

async function closedPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

describe("a stream's connection, as Studio is told it", () => {
  it("is being opened, then being opened again, with the platform's code and text", async () => {
    const events = wired();
    const api = defineApi({
      expose: true,
      baseURL: `http://127.0.0.1:${await closedPort()}`,
      endpoints: { feed: stream.response<number>().get("feed") },
    });

    const subscription = createCaller(api).feed();
    closers.push(() => subscription.close());
    await expect
      .poll(() =>
        events.some((event) => event.type === "stream:status" && event.status === "reconnecting"),
      )
      .toBe(true);

    const opened = events.find((event) => event.type === "stream:open");
    const told = events.filter((event) => event.type === "stream:status");
    expect(told[0]).toMatchObject({
      requestId: opened?.id,
      status: "connecting",
      sessionId: "app",
    });
    expect(told[1]).toMatchObject({
      id: opened?.id,
      requestId: opened?.id,
      status: "reconnecting",
      openedBefore: false,
      failures: 1,
      retryIn: expect.any(Number),
      cause: { code: "ECONNREFUSED", message: expect.stringContaining("ECONNREFUSED") },
    });
  });

  it("is the close a channel's socket reported, as a direct caller opened it", async () => {
    const events = wired();
    const api = defineApi({
      expose: true,
      baseURL: `http://127.0.0.1:${await closedPort()}`,
      endpoints: { room: channel.response<string>().connect("ws") },
    });

    const room = createCaller(api).room();
    closers.push(() => room.close());
    await expect
      .poll(() =>
        events.some((event) => event.type === "stream:status" && event.status === "reconnecting"),
      )
      .toBe(true);

    const opened = events.find((event) => event.type === "stream:open");
    expect(
      events.find((e) => e.type === "stream:status" && e.status === "reconnecting"),
    ).toMatchObject({
      requestId: opened?.id,
      failures: 1,
      cause: { message: "The socket closed with code 1006 before it opened" },
    });
  });

  it("keeps a cause in the shape a request's takes: a code that reads as one, a text of 300 characters at most", () => {
    const events = wired();

    studioHooks.onStreamStatus?.({
      requestId: "req_1",
      status: "reconnecting",
      failures: 2,
      retryIn: 2000,
      cause: { code: "not a code", message: "x".repeat(1_000) },
      timestamp: 1,
    });
    studioHooks.onStreamStatus?.({ requestId: "req_1", status: "open", timestamp: 2 });

    expect(events).toEqual([
      expect.objectContaining({ status: "reconnecting", cause: { message: "x".repeat(300) } }),
      {
        id: "req_1",
        type: "stream:status",
        timestamp: 2,
        requestId: "req_1",
        status: "open",
        sessionId: "app",
      },
    ]);
  });
});
