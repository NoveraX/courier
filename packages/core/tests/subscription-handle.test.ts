/**
 * The one subscription object every kind of stream and channel is, run by a
 * driver the test plays by hand: its events, what it keeps for its first
 * reader, its loop, the order it ends in, `reconnect()` and `close()`.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { ConfigurationError } from "../src/errors/configuration-error";
import { ChannelHandle } from "../src/realtime/channel-handle";
import { ConnectionError, ForbiddenError, RealtimeError } from "../src/realtime/errors";
import { observeData } from "../src/realtime/observe-data";
import type { SubscriptionDriver, SubscriptionSink } from "../src/realtime/subscription-driver";
import { SubscriptionHandle } from "../src/realtime/subscription-handle";
import type { CloseInfo, OpenInfo, Subscription } from "../src/realtime/subscription-types";

afterEach(() => {
  vi.restoreAllMocks();
});

/* A driver the test tells what to say; each life of the subscription is one sink. */
function played({ reopenable = true }: { reopenable?: boolean } = {}) {
  const sinks: SubscriptionSink<unknown>[] = [];
  const driver = {
    open: vi.fn((sink: SubscriptionSink<unknown>) => void sinks.push(sink)),
    reopen: vi.fn((sink: SubscriptionSink<unknown>) => void sinks.push(sink)),
    reconnect: vi.fn(),
    close: vi.fn(),
  };
  const { reopen, ...rest } = driver;
  const runs: SubscriptionDriver<unknown> = reopenable ? driver : rest;
  const subscription = new SubscriptionHandle<unknown>(runs);
  const sink = (): SubscriptionSink<unknown> => {
    const last = sinks.at(-1);
    if (!last) throw new Error("not opened");
    return last;
  };
  return { subscription, driver, sink, sinks };
}

function heard(subscription: Subscription<unknown>): string[] {
  const told: string[] = [];
  subscription.on("status", (status) => told.push(`status ${status}`));
  subscription.on("open", (info: OpenInfo) => told.push(`open ${info.first} ${info.resumed}`));
  subscription.on("error", (error) => told.push(`error ${error.code}`));
  subscription.on("close", (info: CloseInfo) => told.push(`close ${info.reason}`));
  return told;
}

describe("a subscription's events", () => {
  it("refuses an event it does not have, in its types and as it runs", () => {
    const { subscription } = played();

    // @ts-expect-error — a subscription has no "message" event
    expect(() => subscription.on("message", () => undefined)).toThrow(ConfigurationError);
    // @ts-expect-error — nor "end"
    expect(() => subscription.on("end", () => undefined)).toThrow(/has no "end" event/);
  });

  it("has no send unless it is a channel", () => {
    const push: Subscription<unknown> = played().subscription;
    const channel = new ChannelHandle<string, unknown>(played().driver, () => true);

    // @ts-expect-error — a push subscription has no send
    expect(push.send).toBeUndefined();
    expect(channel.send("hi")).toBe(true);
  });

  it("works with its methods taken apart, as an effect's cleanup or a form's handler", () => {
    const { subscription, driver } = played();
    const channel = new ChannelHandle<string, unknown>(played().driver, () => true);
    const { reconnect, close } = subscription;
    const { send } = channel;

    reconnect();
    close();

    expect(driver.reconnect).toHaveBeenCalledTimes(1);
    expect([subscription.status, send("hi")]).toEqual(["disconnected", true]);
  });

  it("is connecting from the moment it is made", () => {
    expect(played().subscription.status).toBe("connecting");
  });

  it("tells each open whether it is the first and whether nothing was missed", () => {
    const { subscription, sink } = played();
    const told = heard(subscription);

    sink().open({ resumed: true });
    sink().reconnecting();
    sink().open({ resumed: true });
    sink().reconnecting();
    sink().open({ resumed: false });

    expect(told).toEqual([
      "status connected",
      "open true false",
      "status reconnecting",
      "status connected",
      "open false true",
      "status reconnecting",
      "status connected",
      "open false false",
    ]);
  });

  it("ends a failure in order: its error, disconnected, then close", () => {
    const { subscription, sink } = played();
    sink().open({ resumed: false });
    const told = heard(subscription);

    sink().end(new ForbiddenError("Not a member"));

    expect(told).toEqual(["error 4403", "status disconnected", "close failed"]);
  });

  it("tells listeners a RealtimeError for what kept it from opening", () => {
    const { subscription, sink } = played();
    const errors: RealtimeError[] = [];
    subscription.on("error", (error) => errors.push(error));

    sink().end(new ConfigurationError("WS_PATH_NOT_CONFIGURED", "no ws path"));

    expect(errors[0]).toBeInstanceOf(ConnectionError);
    expect(errors[0]?.message).toBe("no ws path");
  });

  it("goes on after an error it is told without ending", () => {
    const { subscription, sink } = played();
    const told = heard(subscription);

    sink().error(new RealtimeError(4422, "Invalid message"));

    expect(told).toEqual(["error 4422"]);
    expect(subscription.status).toBe("connecting");
  });

  it("tells the events of what was said while it was being made to listeners added right after", async () => {
    const subscription = new SubscriptionHandle<unknown>({
      open: (sink) => sink.open({ resumed: false }),
      reconnect: () => undefined,
      close: () => undefined,
    });
    const told = heard(subscription);

    expect(subscription.status).toBe("connected");
    await Promise.resolve();

    expect(told).toEqual(["open true false"]);
  });

  it("keeps telling the others when one listener throws, and logs it", () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { subscription, sink } = played();
    const data: unknown[] = [];
    subscription.on("data", () => {
      throw new Error("listener bug");
    });
    subscription.on("data", (value) => data.push(value));

    sink().data({ data: 1 });

    expect(data).toEqual([1]);
    expect(logged.mock.calls.flat().join(" ")).toContain("A subscription's data listener failed");
  });

  it("stops telling a listener that stopped listening", () => {
    const { subscription, sink } = played();
    const data: unknown[] = [];
    const stop = subscription.on("data", (value) => data.push(value));

    sink().data({ data: 1 });
    stop();
    sink().data({ data: 2 });

    expect(data).toEqual([1]);
  });
});

describe("what comes before anything reads it", () => {
  it("goes to the first data listener, and only what comes after to the next", () => {
    const { subscription, sink } = played();
    sink().data({ data: "early" });

    const first: unknown[] = [];
    const second: unknown[] = [];
    subscription.on("data", (value) => first.push(value));
    subscription.on("data", (value) => second.push(value));
    sink().data({ data: "late" });

    expect([first, second]).toEqual([["early", "late"], ["late"]]);
  });

  it("goes to the loop when the loop reads first", async () => {
    const { subscription, sink } = played();
    sink().data({ data: "early", id: "1" });
    sink().end();

    const events: unknown[] = [];
    for await (const event of subscription) events.push(event);

    expect(events).toEqual([{ data: "early", id: "1" }]);
  });

  it("is seen by an observer without being taken from the first reader", () => {
    const { subscription, sink } = played();
    sink().data({ data: "early" });
    const observed: unknown[] = [];
    observeData(subscription, (value) => observed.push(value));
    sink().data({ data: "late" });

    const read: unknown[] = [];
    subscription.on("data", (value) => read.push(value));

    expect([observed, read]).toEqual([
      ["early", "late"],
      ["early", "late"],
    ]);
  });

  it("is kept within its bound, the oldest dropped and counted", () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { subscription, sink } = played();
    for (let i = 0; i < 1010; i++) sink().data({ data: i });

    const read: unknown[] = [];
    subscription.on("data", (value) => read.push(value));

    expect([read.length, read[0], subscription.dropped]).toEqual([1000, 10, 10]);
  });

  it("is not kept once a listener reads, so a subscription read by listeners keeps nothing", () => {
    const { subscription, sink } = played();
    subscription.on("data", () => undefined);
    for (let i = 0; i < 5000; i++) sink().data({ data: i });

    expect(subscription.dropped).toBe(0);
  });
});

describe("a subscription's loop", () => {
  it("yields each event with its envelope and ends as the server ends it", async () => {
    const { subscription, sink } = played();
    const reading = (async () => {
      const events: unknown[] = [];
      for await (const event of subscription) events.push(event);
      return events;
    })();

    sink().data({ data: 1, seq: 1 });
    sink().data({ data: 2, seq: 2 });
    sink().end();

    expect(await reading).toEqual([
      { data: 1, seq: 1 },
      { data: 2, seq: 2 },
    ]);
  });

  it("rejects with what the subscription failed with, as it came", async () => {
    const { subscription, sink } = played();
    const refused = new ConfigurationError("WS_PATH_NOT_CONFIGURED", "no ws path");

    sink().end(refused);

    await expect(subscription[Symbol.asyncIterator]().next()).rejects.toBe(refused);
  });

  it("closes the subscription when it is left early", async () => {
    const { subscription, sink, driver } = played();
    sink().data({ data: 1 });
    const told = heard(subscription);

    for await (const _event of subscription) break;

    expect(driver.close).toHaveBeenCalledTimes(1);
    expect(told).toEqual(["status disconnected", "close closed"]);
  });
});

describe("close()", () => {
  it("lets the driver go once, and tells the close once", () => {
    const { subscription, driver } = played();
    const told = heard(subscription);

    subscription.close();
    subscription.close();

    expect(driver.close).toHaveBeenCalledTimes(1);
    expect(told).toEqual(["status disconnected", "close closed"]);
  });

  it("hears nothing more: the driver's late words, nor listeners added after", () => {
    const { subscription, sink } = played();
    subscription.close();
    const data: unknown[] = [];

    subscription.on("data", (value) => data.push(value));
    sink().data({ data: "late" });
    sink().open({ resumed: false });

    expect([data, subscription.status]).toEqual([[], "disconnected"]);
  });

  it("does not tell the close again after the server ended it", () => {
    const { subscription, sink, driver } = played();
    sink().end();
    const told = heard(subscription);

    subscription.close();

    expect(told).toEqual([]);
    expect(driver.close).not.toHaveBeenCalled();
  });
});

describe("reconnect()", () => {
  it("asks the driver to reconnect a live subscription", () => {
    const { subscription, driver } = played();

    subscription.reconnect();

    expect(driver.reconnect).toHaveBeenCalledTimes(1);
  });

  it("opens one the server ended again, its listeners kept and told once each", () => {
    const { subscription, sink, driver, sinks } = played();
    const data: unknown[] = [];
    subscription.on("data", (value) => data.push(value));
    sink().end(new RealtimeError(4401, "Token expired"));

    subscription.reconnect();
    sink().open({ resumed: false });
    sink().data({ data: "again" });

    expect(driver.reopen).toHaveBeenCalledTimes(1);
    expect(sinks).toHaveLength(2);
    expect([data, subscription.status]).toEqual([["again"], "connected"]);
  });

  it("opens a life of its own when a listener of the end opens it again", async () => {
    const { subscription, sink, sinks } = played();
    const old = subscription[Symbol.asyncIterator]()
      .next()
      .catch((error: unknown) => error);
    const told = heard(subscription);
    subscription.on("status", (status) => {
      if (status === "disconnected") subscription.reconnect();
    });

    sink().end(new RealtimeError(4401, "Token expired"));
    sinks.at(-1)?.open({ resumed: false });
    sinks.at(-1)?.data({ data: "again" });

    expect(await old).toBeInstanceOf(RealtimeError);
    expect(told).toEqual([
      "error 4401",
      "status disconnected",
      "status connecting",
      "status connected",
      "open true false",
    ]);
    const next = await subscription[Symbol.asyncIterator]().next();
    expect([next.value?.data, subscription.status]).toEqual(["again", "connected"]);
  });

  it("hears nothing more from the life before", () => {
    const { subscription, sinks } = played();
    sinks[0]?.end();
    subscription.reconnect();
    const data: unknown[] = [];
    subscription.on("data", (value) => data.push(value));

    sinks[0]?.data({ data: "stale" });

    expect(data).toEqual([]);
  });

  it("does nothing, with a warning, on a subscription that was closed", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { subscription, driver } = played();
    subscription.close();

    subscription.reconnect();

    expect(driver.reconnect).not.toHaveBeenCalled();
    expect(driver.reopen).not.toHaveBeenCalled();
    expect(warn.mock.calls.flat().join(" ")).toContain(
      "does nothing on a subscription that was closed",
    );
  });

  it("does nothing, with a warning, on one that cannot be opened again", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { subscription, sink } = played({ reopenable: false });
    sink().end();

    subscription.reconnect();

    expect(subscription.status).toBe("disconnected");
    expect(warn.mock.calls.flat().join(" ")).toContain("cannot be opened again");
  });
});
