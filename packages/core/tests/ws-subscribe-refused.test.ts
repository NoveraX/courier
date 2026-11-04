/**
 * A subscribe the server refuses outright — more control frames in a
 * second than it takes — never starts there, so the client's channel ends
 * with the refusal rather than waiting for a confirmation that never comes.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { courier } from "../src/define/courier";
import { RateLimitError } from "../src/realtime/errors";
import type { WSChannel } from "../src/realtime/types";
import { executeWSChannel } from "../src/realtime/ws-channel-client";
import { type ServedWS, serveWS, stopWS } from "./helpers/ws-server";

const { channel } = courier();

let served: ServedWS | undefined;

afterEach(async () => {
  vi.restoreAllMocks();
  await stopWS(served);
  served = undefined;
});

const room = channel
  .variables(z.object({ room: z.string() }))
  .send<string>()
  .response<string>()
  .implement(() => ({ onMessage: () => undefined }));

describe("a subscribe the server refuses for its rate", () => {
  it("ends the channel with the refusal, so none stands waiting", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    /* Two subscriptions, so four control frames a second: the socket's auth and three subscribes. */
    served = await serveWS({ room }, { maxSubscriptionsPerConnection: 2 });
    const config = {};
    const channels: WSChannel<string, string>[] = [];
    const errors = new Map<WSChannel<string, string>, unknown[]>();
    for (let i = 0; i < 6; i++) {
      const ch = executeWSChannel<string, string>(
        served.url,
        "api.live.room",
        { room: `r${i}` },
        config,
      );
      errors.set(ch, []);
      ch.on("error", (error) => errors.get(ch)?.push(error));
      channels.push(ch);
    }

    await vi.waitFor(() => expect(channels.map((ch) => ch.status)).not.toContain("connecting"));

    const ended = channels.filter((ch) => ch.status === "disconnected");
    expect(ended.length).toBeGreaterThan(0);
    for (const ch of ended) expect(errors.get(ch)).toEqual([expect.any(RateLimitError)]);
    for (const ch of channels) ch.close();
  });
});
