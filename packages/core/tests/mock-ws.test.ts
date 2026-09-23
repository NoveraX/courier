/**
 * The in-memory channel `createMockWSChannel` builds for tests, held to what
 * a real channel's handlers see.
 */
import { describe, expect, it } from "vitest";

import { ForbiddenError, type RealtimeError } from "../src/realtime/errors";
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

  it("reports a failed onJoin as an error, then disconnects", async () => {
    const channel = createMockWSChannel({
      onJoin: () => {
        throw new ForbiddenError("Not a member of this room");
      },
      onMessage: () => undefined,
    });
    const errors: RealtimeError[] = [];
    channel.on("error", (error) => errors.push(error));

    await settle();

    expect(errors[0]).toBeInstanceOf(ForbiddenError);
    expect(channel.status).toBe("disconnected");
  });

  it("reports a failed onMessage as an error and goes on", async () => {
    const channel = createMockWSChannel<string, string>({
      onMessage: (ctx, message) => {
        if (message === "boom") throw new Error("handler bug");
        ctx.send(`echo:${message}`);
      },
    });
    const errors: RealtimeError[] = [];
    const data: string[] = [];
    channel.on("error", (error) => errors.push(error));
    channel.on("data", (message) => data.push(message));
    await settle();

    channel.send("boom");
    channel.send("fine");
    await settle();

    expect(errors.map((error) => [error.code, error.message])).toEqual([[5000, "Handler error"]]);
    expect(data).toEqual(["echo:fine"]);
    expect(channel.status).toBe("connected");
  });

  it("ends with the reason a handler gave when it closes the channel", async () => {
    const channel = createMockWSChannel({
      onJoin: (ctx: WSChannelContext) => ctx.close(4001, "kicked"),
      onMessage: () => undefined,
    });
    const errors: RealtimeError[] = [];
    channel.on("error", (error) => errors.push(error));

    await settle();

    expect(errors[0]).toMatchObject({ code: 4001, message: "kicked" });
    expect(channel.status).toBe("disconnected");
  });
});
