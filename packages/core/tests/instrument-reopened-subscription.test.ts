/**
 * A subscription the server ended and `reconnect()` opened again is shown
 * in Studio as it is: each life an entry of its own — the one that ended
 * closed with how it ended, the new one open and given what it delivers —
 * whichever of its listeners opened it again: `close`, `error` or the
 * status it went `disconnected` with. One the application closed is shown
 * closed, and Studio hears nothing more of it.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ChannelHandle } from "../src/realtime/channel-handle";
import { ConnectionError } from "../src/realtime/errors";
import type { SubscriptionDriver, SubscriptionSink } from "../src/realtime/subscription-driver";
import { SubscriptionHandle } from "../src/realtime/subscription-handle";
import { studioHooks } from "../src/studio";
import type { StudioHooks } from "../src/studio/hooks";
import { instrumentSSE, instrumentWSChannel } from "../src/transport/instrument";
import { beginStream } from "../src/transport/instrument/core";

let originalHooks: StudioHooks;

beforeEach(() => {
  originalHooks = { ...studioHooks };
});

afterEach(() => {
  for (const key of Object.keys(studioHooks) as Array<keyof StudioHooks>) {
    delete studioHooks[key];
  }
  Object.assign(studioHooks, originalHooks);
});

const META = {
  source: "demo",
  group: "notifications",
  method: "feed",
  transport: "sse" as const,
  mode: "direct" as const,
};

type HookEvent<TName extends keyof StudioHooks> = Parameters<NonNullable<StudioHooks[TName]>>[0];

/** What Studio was told, entry by entry, in order: each entry by the order it was opened in. */
function recordStudio() {
  const told: string[] = [];
  const opened: string[] = [];
  const entry = (requestId: string): number => opened.indexOf(requestId);
  studioHooks.onStreamOpen = (event: HookEvent<"onStreamOpen">) => {
    /* Opened again with the same id, the entry is told what is new of it, and is the same one. */
    if (opened.includes(event.requestId)) return;
    opened.push(event.requestId);
    told.push(`open ${entry(event.requestId)}`);
  };
  studioHooks.onStreamMessage = (event: HookEvent<"onStreamMessage">) => {
    told.push(`message ${entry(event.requestId)} ${event.dataPreview ?? ""}`);
  };
  studioHooks.onStreamError = (event: HookEvent<"onStreamError">) => {
    told.push(`error ${entry(event.requestId)} ${event.error}`);
  };
  studioHooks.onStreamClose = (event: HookEvent<"onStreamClose">) => {
    told.push(`close ${entry(event.requestId)} ${event.reason}`);
  };
  return { told, opened };
}

/** A driver the test runs by hand, one sink per life, that a server can end and `reconnect()` open again. */
function manualDriver() {
  const sinks: SubscriptionSink<unknown>[] = [];
  const driver: SubscriptionDriver<unknown> = {
    open: (sink) => void sinks.push(sink),
    reopen: (sink) => void sinks.push(sink),
    reconnect: () => undefined,
    close: () => undefined,
  };
  const life = (): SubscriptionSink<unknown> => {
    const sink = sinks.at(-1);
    if (!sink) throw new Error("not opened");
    return sink;
  };
  return { driver, life, lives: () => sinks.length };
}

function manualSubscription() {
  const { driver, ...run } = manualDriver();
  return { subscription: new SubscriptionHandle(driver), ...run };
}

function manualChannel() {
  const { driver, ...run } = manualDriver();
  return { channel: new ChannelHandle<unknown, unknown>(driver, () => true), ...run };
}

describe("a subscription the server ended, opened again with reconnect()", () => {
  it("is a new entry when its close listener opens it again", () => {
    const { told } = recordStudio();
    const { subscription, life } = manualSubscription();
    instrumentSSE(subscription, META);
    subscription.on("close", () => subscription.reconnect());

    life().open({ resumed: false });
    life().data({ data: 1 });
    life().end();
    life().open({ resumed: false });
    life().data({ data: 2 });

    expect(told).toEqual(["open 0", "message 0 1", "close 0 complete", "open 1", "message 1 2"]);
  });

  it("is a new entry when its error listener opens it again, the old one failed", () => {
    const { told } = recordStudio();
    const { subscription, life } = manualSubscription();
    instrumentSSE(subscription, META);
    let reopened = false;
    subscription.on("error", () => {
      if (reopened) return;
      reopened = true;
      subscription.reconnect();
    });

    life().open({ resumed: false });
    life().end(new ConnectionError("upstream went away"));
    life().open({ resumed: false });
    life().data({ data: 3 });

    expect(told).toEqual([
      "open 0",
      "error 0 upstream went away",
      "close 0 error",
      "open 1",
      "message 1 3",
    ]);
  });

  it("is a new entry when a status listener opens it again as it goes disconnected", () => {
    const { told } = recordStudio();
    const { subscription, life } = manualSubscription();
    instrumentSSE(subscription, META);
    let reopened = false;
    subscription.on("status", (status) => {
      if (status !== "disconnected" || reopened) return;
      reopened = true;
      subscription.reconnect();
    });

    life().open({ resumed: false });
    life().end();
    life().open({ resumed: false });
    life().data({ data: 4 });

    expect(told).toEqual(["open 0", "close 0 complete", "open 1", "message 1 4"]);
  });

  it("gives an entry Studio opened under its own id a new one for the life after", () => {
    const { opened } = recordStudio();
    const { subscription, life } = manualSubscription();
    instrumentSSE(subscription, META, beginStream(META, "pg_studio-run"));
    subscription.on("close", () => subscription.reconnect());

    life().end();
    life().open({ resumed: false });

    expect(opened).toHaveLength(2);
    expect(opened[0]).toBe("pg_studio-run");
    expect(opened[1]).not.toBe("pg_studio-run");
  });

  it("shows each life of a channel what it received and what it took to send", () => {
    const { told } = recordStudio();
    const { channel, life } = manualChannel();
    instrumentWSChannel(channel, { ...META, transport: "ws" });
    channel.on("close", () => channel.reconnect());

    life().open({ resumed: false });
    channel.send("hello");
    life().end();
    life().open({ resumed: false });
    life().data({ data: 5 });
    channel.send("again");

    expect(told).toEqual([
      "open 0",
      "message 0 hello",
      "close 0 complete",
      "open 1",
      "message 1 5",
      "message 1 again",
    ]);
  });
});

describe("a subscription the server ended as it was made", () => {
  it("is shown closed, and its next life opened again as a new entry", () => {
    const { told } = recordStudio();
    const sinks: SubscriptionSink<unknown>[] = [];
    const subscription = new SubscriptionHandle<unknown>({
      open: (sink) => {
        sinks.push(sink);
        sink.end();
      },
      reopen: (sink) => void sinks.push(sink),
      reconnect: () => undefined,
      close: () => undefined,
    });
    instrumentSSE(subscription, META);

    subscription.reconnect();
    sinks.at(-1)?.data({ data: 7 });

    expect(told).toEqual(["open 0", "close 0 complete", "open 1", "message 1 7"]);
  });
});

describe("a subscription the application closed", () => {
  it("is shown closed, and nothing after reaches Studio", () => {
    const { told } = recordStudio();
    const { subscription, life, lives } = manualSubscription();
    instrumentSSE(subscription, META);

    life().open({ resumed: false });
    subscription.close();
    subscription.reconnect();
    life().data({ data: 6 });

    expect(told).toEqual(["open 0", "close 0 disconnect"]);
    expect(lives()).toBe(1);
  });
});
