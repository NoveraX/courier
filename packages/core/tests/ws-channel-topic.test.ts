/**
 * A channel's `.topic()`: what its subscribers share a topic by, end to end
 * on a real `ws` server, in-process, and at the type level.
 *
 * `.topic()` names the variables a topic is qualified by, so a
 * per-subscriber field such as a nickname does not split one room into as
 * many topics as it has members, and `ctx.broadcast(ctx.topic, …)` reaches
 * the room.
 */
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";

import { courier } from "../src/define/courier";
import { ConfigurationError } from "../src/errors/configuration-error";
import type { RealtimeError } from "../src/realtime/errors";
import { executeWSChannel } from "../src/realtime/ws-channel-client";
import { executeDirectWSChannel } from "../src/transport/in-process/ws-channel";
import { createPlaygroundWSRegistry } from "../src/transport/in-process/ws-registry";
import { type ServedWS, serveWS, settle, stopWS, subscribers } from "./helpers/ws-server";

const { channel, stream } = courier();

interface Line {
  from: string;
  text: string;
}

const members = z.object({ room: z.string(), nick: z.string() });

function chatRoom(keyed: boolean) {
  const base = channel.variables(members);
  const chain = keyed ? base.topic((v) => ({ room: v.room })) : base;
  return chain
    .send(z.object({ text: z.string() }))
    .response<Line>()
    .implement((v) => ({
      onMessage(ctx, message) {
        ctx.send({ from: "echo", text: message.text });
        void ctx.broadcast(ctx.topic, { from: v.nick, text: message.text });
      },
    }));
}

let served: ServedWS | undefined;

afterEach(async () => {
  await stopWS(served);
  served = undefined;
});

/** Join over a connection of its own, as another browser would. */
function join(url: string, room: string, nick: string) {
  const ch = executeWSChannel<{ text: string }, Line>(`${url}?nick=${nick}`, "api.live.room", {
    room,
    nick,
  });
  const data: Line[] = [];
  const errors: RealtimeError[] = [];
  ch.on("data", (line) => data.push(line));
  ch.on("error", (error) => errors.push(error));
  return { ch, data, errors };
}

describe("a channel keyed by room", () => {
  it("broadcasts to every member of the room, whatever their nick", async () => {
    served = await serveWS({ room: chatRoom(true) });
    const alice = join(served.url, "r1", "alice");
    const bob = join(served.url, "r1", "bob");
    const carol = join(served.url, "r2", "carol");
    await expect.poll(() => subscribers(served), { timeout: 2000 }).toBe(3);

    alice.ch.send({ text: "hi from alice" });

    await expect
      .poll(() => [alice.data, bob.data], { timeout: 2000 })
      .toEqual([
        [{ from: "echo", text: "hi from alice" }],
        [{ from: "alice", text: "hi from alice" }],
      ]);
    /* A line that should reach no one else would arrive about when Bob's did. */
    await settle(80);
    expect([alice.data, bob.data, carol.data]).toEqual([
      [{ from: "echo", text: "hi from alice" }],
      [{ from: "alice", text: "hi from alice" }],
      [],
    ]);
    for (const member of [alice, bob, carol]) member.ch.close();
  });

  it("gives each member its own variables", async () => {
    served = await serveWS({ room: chatRoom(true) });
    const alice = join(served.url, "r1", "alice");
    const bob = join(served.url, "r1", "bob");
    await expect.poll(() => subscribers(served), { timeout: 2000 }).toBe(2);

    bob.ch.send({ text: "hi from bob" });

    await expect
      .poll(() => alice.data, { timeout: 2000 })
      .toEqual([{ from: "bob", text: "hi from bob" }]);
    alice.ch.close();
    bob.ch.close();
  });

  it("ends the subscription when its key fails", async () => {
    const broken = channel
      .variables(members)
      .topic(() => {
        throw new Error("no rooms today");
      })
      .send(z.object({ text: z.string() }))
      .response<Line>()
      .implement(() => ({ onMessage: () => undefined }));
    served = await serveWS({ room: broken });

    const alice = join(served.url, "r1", "alice");

    await expect
      .poll(() => [alice.errors.map((error) => [error.code, error.message]), alice.ch.status], {
        timeout: 2000,
      })
      .toEqual([[[5000, "Subscription failed"]], "disconnected"]);
  });
});

describe("a channel without a key", () => {
  it("keeps members whose variables differ on topics of their own", async () => {
    served = await serveWS({ room: chatRoom(false) });
    const alice = join(served.url, "r1", "alice");
    const bob = join(served.url, "r1", "bob");
    await expect.poll(() => subscribers(served), { timeout: 2000 }).toBe(2);

    alice.ch.send({ text: "hi from alice" });

    /* Alice's echo says her line was handled; a broadcast to Bob would come about then. */
    await expect
      .poll(() => alice.data, { timeout: 2000 })
      .toEqual([{ from: "echo", text: "hi from alice" }]);
    await settle(80);
    expect(bob.data).toEqual([]);
    alice.ch.close();
    bob.ch.close();
  });
});

describe("a keyed channel served in-process", () => {
  it("broadcasts between members whose nicks differ", async () => {
    const room = chatRoom(true);
    const sources = { api: { options: { expose: true, groups: { chat: { options: {}, room } } } } };
    const registry = createPlaygroundWSRegistry();
    const open = (nick: string) =>
      executeDirectWSChannel(
        sources as never,
        { source: "api", group: "chat", method: "room", variables: { room: "r1", nick } },
        { registry },
      );
    const alice = await open("alice");
    const bob = await open("bob");
    const heard: unknown[] = [];
    bob.on("data", (line) => heard.push(line));

    alice.send({ text: "hi from alice" });

    await expect
      .poll(() => heard, { timeout: 2000 })
      .toEqual([{ from: "alice", text: "hi from alice" }]);
    alice.close();
    bob.close();
  });
});

describe("defining a topic key", () => {
  it("is refused on a channel another process serves", () => {
    const keyed = channel.variables(members).topic((v) => v.room);

    expect(() => keyed.connect("room")).toThrow(ConfigurationError);
    expect(() => keyed.connect("room")).toThrow(/TOPIC_ON_REMOTE_CHANNEL|decides its topics/);
  });

  it("is refused when named twice", () => {
    const keyed = channel.variables(members).topic((v) => v.room);

    expect(() => keyed.topic((v) => v.nick)).toThrow(/called twice/);
  });

  it("types the key's variables and what it may return", () => {
    /* Checked by the compiler, never run: two of these have no `topic` at all. */
    const typeChecks = () => {
      channel.variables(members).topic((v) => ({ room: v.room, members: [v.nick] }));
      // @ts-expect-error — the variables have no such field
      channel.variables(members).topic((v) => v.nope);
      // @ts-expect-error — a function is not something JSON carries
      channel.variables(members).topic(() => () => "r1");
      // @ts-expect-error — only a channel has subscribers to share a topic
      stream.variables(members).topic((v) => v.room);
      const served = channel.variables(members).connect("room");
      // @ts-expect-error — a channel another process serves has its topics decided there
      served.topic((v) => v.room);
    };

    expect(typeChecks).toBeTypeOf("function");
  });
});
