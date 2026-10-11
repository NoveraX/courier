/**
 * A channel's call is typed as what a client opens for it: a channel that
 * takes messages, declared with `.send()`, returns a `WSChannel`; one
 * nothing can send on is a push, and returns a subscription read as a
 * stream's is — `for await`, each value in `event.data`.
 */
import { describe, expectTypeOf, it } from "vitest";

import { createCaller } from "../src/caller";
import { defineApi } from "../src/define/api";
import { courier } from "../src/define/courier";
import { defineGroup } from "../src/define/group";
import { createProxyCaller } from "../src/proxy-caller";
import type { SSESubscription, WSChannel } from "../src/realtime/types";

const { channel } = courier();

const live = defineApi({
  name: "live",
  baseURL: "https://live.example",
  groups: {
    rooms: defineGroup({
      prefix: "rooms",
      endpoints: {
        chat: channel.send<{ text: string }>().response<{ text: string }>().connect("chat"),
        ticks: channel.response<number>().connect("ticks"),
      },
    }),
  },
});

describe("a channel's call", () => {
  it("returns a WSChannel for a channel that takes messages", () => {
    expectTypeOf(createCaller(live).rooms.chat).returns.toEqualTypeOf<
      WSChannel<{ text: string }, { text: string }>
    >();
  });

  it("returns a subscription for a push, from a direct caller and a proxy caller alike", () => {
    expectTypeOf(createCaller(live).rooms.ticks).returns.toEqualTypeOf<SSESubscription<number>>();
    expectTypeOf(
      createProxyCaller<typeof live>("live", { source: live }).rooms.ticks,
    ).returns.toEqualTypeOf<SSESubscription<number>>();
  });
});
