/**
 * The in-memory channel `createMockWSChannel` builds for tests, held to what
 * a real channel's handlers see.
 */
import { describe, expect, it } from "vitest";

import type { WSChannelContext } from "../src/realtime/types";
import { createMockWSChannel } from "../src/testing/mock-ws";

const settle = () => new Promise((resolve) => setTimeout(resolve, 5));

describe("createMockWSChannel", () => {
  it("fires the handler's signal when the channel closes", async () => {
    let signal: AbortSignal | undefined;
    const channel = createMockWSChannel({
      onJoin: (ctx: WSChannelContext) => {
        signal = ctx.signal;
      },
      onMessage: () => undefined,
    });
    await settle();
    expect(signal?.aborted).toBe(false);

    channel.close();

    expect(signal?.aborted).toBe(true);
  });
});
