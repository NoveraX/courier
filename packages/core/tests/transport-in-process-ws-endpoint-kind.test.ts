import { describe, expect, it, vi } from "vitest";

import { courier } from "../src/define/courier";
import { wsEndpointKind } from "../src/transport/in-process/ws-endpoint-kind";

const { channel, stream } = courier();

const sources = {
  api: {
    options: { groups: {} },
    ticker: channel.response<number>().implement(async function* () {
      yield 1;
    }),
    room: channel
      .send<string>()
      .response<string>()
      .implement(() => ({ onMessage: vi.fn() })),
    feed: stream.response<number>().implement(async function* () {
      yield { data: 1 };
    }),
  },
};

describe("wsEndpointKind", () => {
  it("tells a channel, which takes messages, from a push, which only sends", () => {
    expect(wsEndpointKind(sources, { source: "api", method: "room" })).toBe("channel");
    expect(wsEndpointKind(sources, { source: "api", method: "ticker" })).toBe("push");
  });

  it("names no kind for an SSE stream, or where there is no endpoint", () => {
    expect(wsEndpointKind(sources, { source: "api", method: "feed" })).toBeUndefined();
    expect(wsEndpointKind(sources, { source: "api", method: "missing" })).toBeUndefined();
    expect(wsEndpointKind(sources, { source: "other", method: "room" })).toBeUndefined();
  });
});
