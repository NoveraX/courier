/**
 * What a channel sends and broadcasts is held to its `.response()` schema,
 * end to end on a real `ws` server and in-process.
 *
 * `ctx.send` and `ctx.broadcast` of a channel the caller can send on are
 * checked as a push channel's values are, so nothing reaches the wire that
 * the client would read typed as the schema promised while it is not.
 */
import type { StandardSchemaV1 } from "@standard-schema/spec";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { courier } from "../src/define/courier";
import type { RealtimeError } from "../src/realtime/errors";
import type { WSChannelContext } from "../src/realtime/types";
import { executeWSChannel } from "../src/realtime/ws-channel-client";
import { executeDirectWSChannel } from "../src/transport/in-process/ws-channel";
import { createPlaygroundWSRegistry } from "../src/transport/in-process/ws-registry";
import { type ServedWS, serveWS, settle, stopWS, subscribers } from "./helpers/ws-server";

const { channel } = courier();

const Reading = z.object({ n: z.number(), unit: z.string().default("ms") });

type Command = { say?: unknown; shout?: unknown };

/** A channel whose handler sends or broadcasts whatever the client asks it to. */
function relay(response: StandardSchemaV1 = Reading) {
  return channel
    .variables(z.object({ room: z.string() }))
    .send(z.object({ say: z.unknown().optional(), shout: z.unknown().optional() }))
    .response(response)
    .implement(() => ({
      onMessage(ctx: WSChannelContext<unknown>, message: Command) {
        if (message.say !== undefined) ctx.send(message.say);
        if (message.shout !== undefined) ctx.broadcast(ctx.topic, message.shout);
      },
    }));
}

/** A schema that answers only asynchronously, as one with async refinements does. */
const asyncSchema: StandardSchemaV1 = {
  "~standard": {
    version: 1,
    vendor: "test",
    validate: async (value) => ({ value }),
  },
};

let served: ServedWS | undefined;

afterEach(async () => {
  vi.restoreAllMocks();
  await stopWS(served);
  served = undefined;
});

function join(url: string, user: string) {
  const ch = executeWSChannel<Command, unknown>(`${url}?user=${user}`, "api.live.room", {
    room: "r1",
  });
  const data: unknown[] = [];
  const errors: RealtimeError[] = [];
  ch.on("data", (message) => data.push(message));
  ch.on("error", (error) => errors.push(error));
  return { ch, data, errors };
}

describe("a channel's ctx.send", () => {
  it("sends the value as the response schema produces it", async () => {
    served = await serveWS({ room: relay() });
    const alice = join(served.url, "alice");
    await expect.poll(() => subscribers(served), { timeout: 2000 }).toBe(1);

    alice.ch.send({ say: { n: 1 } });

    await expect.poll(() => alice.data, { timeout: 2000 }).toEqual([{ n: 1, unit: "ms" }]);
    alice.ch.close();
  });

  it("sends nothing that does not match, tells the client why and goes on", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    served = await serveWS({ room: relay() });
    const alice = join(served.url, "alice");
    await expect.poll(() => subscribers(served), { timeout: 2000 }).toBe(1);

    alice.ch.send({ say: { n: "not-a-number" } });
    alice.ch.send({ say: { n: 2 } });

    /* The refusal of the first comes on the same socket before the second's value. */
    await expect.poll(() => alice.data, { timeout: 2000 }).toEqual([{ n: 2, unit: "ms" }]);
    expect(alice.errors.map((error) => error.code)).toEqual([4422]);
    expect(alice.ch.status).toBe("connected");
    alice.ch.close();
  });

  it("refuses a response schema that validates asynchronously, without its value", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    served = await serveWS({ room: relay(asyncSchema) });
    const alice = join(served.url, "alice");
    await expect.poll(() => subscribers(served), { timeout: 2000 }).toBe(1);

    alice.ch.send({ say: { n: 1 } });

    await expect
      .poll(() => alice.errors.map((error) => [error.code, error.message]), { timeout: 2000 })
      .toEqual([[5000, "Handler error"]]);
    /* What should never come would come right behind the refusal. */
    await settle(60);
    expect(alice.data).toEqual([]);
    alice.ch.close();
  });
});

describe("a channel's ctx.broadcast", () => {
  it("reaches the room as the response schema produces it", async () => {
    served = await serveWS({ room: relay() });
    const alice = join(served.url, "alice");
    const bob = join(served.url, "bob");
    await expect.poll(() => subscribers(served), { timeout: 2000 }).toBe(2);

    alice.ch.send({ shout: { n: 3 } });

    await expect.poll(() => bob.data, { timeout: 2000 }).toEqual([{ n: 3, unit: "ms" }]);
    alice.ch.close();
    bob.ch.close();
  });

  it("reaches no one with what does not match, and tells the sender why", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    served = await serveWS({ room: relay() });
    const alice = join(served.url, "alice");
    const bob = join(served.url, "bob");
    await expect.poll(() => subscribers(served), { timeout: 2000 }).toBe(2);

    alice.ch.send({ shout: { n: "loud" } });

    await expect
      .poll(() => alice.errors.map((error) => error.code), { timeout: 2000 })
      .toEqual([4422]);
    /* A broadcast that should not go out would reach Bob about when the refusal reaches Alice. */
    await settle(60);
    expect(bob.data).toEqual([]);
    alice.ch.close();
    bob.ch.close();
  });
});

describe("a channel served in-process", () => {
  const sourcesOf = (room: unknown) => ({
    api: { options: { expose: true, groups: { chat: { options: {}, room } } } },
  });

  it("delivers what it sends and broadcasts as the response schema produces it", async () => {
    const sources = sourcesOf(relay());
    const registry = createPlaygroundWSRegistry();
    const open = () =>
      executeDirectWSChannel(
        sources as never,
        { source: "api", group: "chat", method: "room", variables: { room: "r1" } },
        { registry },
      );
    const alice = await open();
    const bob = await open();
    const heardByAlice: unknown[] = [];
    const heardByBob: unknown[] = [];
    alice.on("data", (message) => heardByAlice.push(message));
    bob.on("data", (message) => heardByBob.push(message));

    await alice.send({ say: { n: 1 } });
    await alice.send({ shout: { n: 2 } });

    expect(heardByAlice).toEqual([{ n: 1, unit: "ms" }]);
    expect(heardByBob).toEqual([{ n: 2, unit: "ms" }]);
    alice.close();
    bob.close();
  });

  it("refuses what does not match", async () => {
    const sources = sourcesOf(relay());
    const alice = await executeDirectWSChannel(
      sources as never,
      { source: "api", group: "chat", method: "room", variables: { room: "r1" } },
      { registry: createPlaygroundWSRegistry() },
    );
    const heard: unknown[] = [];
    alice.on("data", (message) => heard.push(message));

    await expect(alice.send({ say: { n: "nope" } })).rejects.toThrow(/onMessage failed/);
    expect(heard).toEqual([]);
    alice.close();
  });
});
