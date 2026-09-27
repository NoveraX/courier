/**
 * WebSocket subscriptions end to end: a real `ws` server running Courier's
 * handler, read by Courier's own client.
 *
 * The server told the client nothing when it ended a subscription, and sent
 * its refusals as errors the client only logged: a channel whose join was
 * rejected stayed "connected", a push that failed or finished left the
 * reader waiting forever, and of two subscribers to one topic, the first to
 * leave silenced the other.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { WebSocketServer } from "ws";
import { z } from "zod";

import { createWSHandler } from "../src/adapter/handle-ws";
import { courier } from "../src/define/courier";
import { attachWebSocketUpgrade, type UpgradeServer } from "../src/node";
import { clearWSConnectionPool } from "../src/realtime/caller-ws";
import {
  ForbiddenError,
  RealtimeError,
  RealtimeValidationError,
} from "../src/realtime/errors";
import type { WSChannelContext, WSContext } from "../src/realtime/types";
import { executeWSChannel } from "../src/realtime/ws-channel-client";
import { executeWSPush } from "../src/realtime/ws-subscription";
import { _resetSourcesForTests, registerSources } from "../src/sources";

const { channel } = courier();
const settle = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms));

let server: Server | undefined;

afterEach(async () => {
  clearWSConnectionPool();
  _resetSourcesForTests();
  server?.closeAllConnections();
  await new Promise<void>((resolve) => server?.close(() => resolve()) ?? resolve());
  server = undefined;
});

/** Serve `feed` as `api.live.feed` and answer with the client's URL. */
async function serve(feed: unknown): Promise<string> {
  registerSources({ api: { options: { groups: { live: { options: {}, feed } } } } } as never);
  const handler = createWSHandler();
  server = createServer();
  attachWebSocketUpgrade(server, {
    path: "/api/ws",
    createServer: (options) => new WebSocketServer(options) as unknown as UpgradeServer,
    onSocket: (socket, request) => handler.handleSocket(socket, request),
  });
  await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
  return `ws://127.0.0.1:${(server.address() as AddressInfo).port}/api/ws`;
}

function push(handler: (ctx: WSContext) => AsyncGenerator<unknown, void, unknown>) {
  return channel
    .variables(z.object({ room: z.string().optional() }))
    .response<unknown>()
    .implement(handler as never);
}

async function readAll(url: string, variables?: Record<string, unknown>): Promise<unknown[]> {
  const seen: unknown[] = [];
  for await (const event of executeWSPush(url, "api.live.feed", variables)) seen.push(event.data);
  return seen;
}

describe("a push subscription", () => {
  it("ends for the reader when the server's generator returns", async () => {
    const url = await serve(
      push(async function* () {
        yield 1;
        yield 2;
      }),
    );

    await expect(readAll(url)).resolves.toEqual([1, 2]);
  });

  it("rejects with the RealtimeError the generator threw, after what came before", async () => {
    const url = await serve(
      push(async function* () {
        yield "before";
        throw new ForbiddenError("Not a member of this room");
      }),
    );
    const seen: unknown[] = [];

    const reading = (async () => {
      for await (const event of executeWSPush(url, "api.live.feed")) seen.push(event.data);
    })();

    await expect(reading).rejects.toThrow(ForbiddenError);
    await expect(reading).rejects.toThrow("Not a member of this room");
    expect(seen).toEqual(["before"]);
  });

  it("rejects with a generic RealtimeError for any other error", async () => {
    const url = await serve(
      push(async function* () {
        throw new Error("connect ECONNREFUSED 10.0.0.5:5432");
      }),
    );

    const failure = await readAll(url).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(RealtimeError);
    expect(failure).toMatchObject({ code: 5000, message: "Subscription failed" });
  });

  it("rejects with the schema's issues when the variables are invalid", async () => {
    const url = await serve(
      push(async function* () {
        yield "never";
      }),
    );

    const failure = await readAll(url, { room: 42 }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(RealtimeValidationError);
    expect((failure as RealtimeValidationError).issues.length).toBeGreaterThan(0);
  });

  it("unsubscribes on the server when the reader leaves the loop early", async () => {
    let signal: AbortSignal | undefined;
    const url = await serve(
      push(async function* (ctx) {
        signal = ctx.signal;
        yield 1;
        await new Promise((resolve) => ctx.signal.addEventListener("abort", resolve));
      }),
    );

    for await (const _event of executeWSPush(url, "api.live.feed")) break;
    await settle();

    expect(signal?.aborted).toBe(true);
  });

  it("keeps delivering to one subscriber when another on the same topic leaves", async () => {
    let emit: (value: number) => void = () => {};
    const url = await serve(
      push(async function* (ctx) {
        const queue: number[] = [];
        let wake: () => void = () => {};
        emit = (value) => {
          queue.push(value);
          wake();
        };
        while (!ctx.signal.aborted) {
          const next = queue.shift();
          if (next !== undefined) yield next;
          else await new Promise<void>((resolve) => (wake = resolve));
        }
      }),
    );
    const staying = executeWSPush<number>(url, "api.live.feed");
    const leaving = executeWSPush<number>(url, "api.live.feed");
    const seen: number[] = [];
    void (async () => {
      for await (const event of staying) seen.push(event.data);
    })();
    await settle();

    leaving.close();
    await settle();
    emit(7);
    await settle();
    staying.close();

    expect(seen).toEqual([7]);
  });
});

describe("a channel", () => {
  function room(handlers: {
    onJoin?: (ctx: WSChannelContext) => void | Promise<void>;
    onMessage?: (ctx: WSChannelContext, message: unknown) => void | Promise<void>;
  }) {
    return channel
      .send(z.object({ text: z.string() }))
      .response<unknown>()
      .implement((() => ({ onMessage: () => undefined, ...handlers })) as never);
  }

  function open(url: string) {
    const ch = executeWSChannel<{ text: unknown }, unknown>(url, "api.live.feed");
    const errors: RealtimeError[] = [];
    const statuses: string[] = [];
    const data: unknown[] = [];
    ch.on("error", (error) => errors.push(error));
    ch.on("status", (status) => statuses.push(status));
    ch.on("data", (message) => data.push(message));
    return { ch, errors, statuses, data };
  }

  it("hears why its join was rejected, then disconnects", async () => {
    const url = await serve(
      room({
        onJoin: () => {
          throw new ForbiddenError("Not a member of this room");
        },
      }),
    );

    const { ch, errors } = open(url);
    await settle(60);

    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(ForbiddenError);
    expect(errors[0]?.message).toBe("Not a member of this room");
    expect(ch.status).toBe("disconnected");
  });

  it("hears of a refused message and goes on", async () => {
    const url = await serve(
      room({
        onJoin: (ctx) => ctx.send("welcome"),
      }),
    );
    const { ch, errors, data } = open(url);
    await settle();

    ch.send({ text: 42 });
    await settle();

    expect(errors[0]).toBeInstanceOf(RealtimeValidationError);
    expect(ch.status).toBe("connected");
    expect(data).toEqual(["welcome"]);
    ch.close();
  });

  it("delivers a message sent the moment it is created", async () => {
    const url = await serve(
      room({
        onMessage: (ctx, message) => ctx.send({ echo: (message as { text: string }).text }),
      }),
    );
    const { ch, errors, data } = open(url);

    ch.send({ text: "early" });
    await settle(60);

    expect(errors).toEqual([]);
    expect(data).toEqual([{ echo: "early" }]);
    ch.close();
  });

  it("hears of a failed onMessage and goes on", async () => {
    const url = await serve(
      room({
        onMessage: (ctx, message) => {
          if ((message as { text: string }).text === "boom") throw new Error("handler bug");
          ctx.send("echo");
        },
      }),
    );
    const { ch, errors, data } = open(url);
    await settle();

    ch.send({ text: "boom" });
    ch.send({ text: "fine" });
    await settle();

    expect(errors.map((error) => error.code)).toEqual([5000]);
    expect(data).toEqual(["echo"]);
    ch.close();
  });

  it("ends when the server closes it, with the reason it gave", async () => {
    const url = await serve(
      room({
        onMessage: (ctx) => ctx.close(4001, "kicked"),
      }),
    );
    const { ch, errors } = open(url);
    await settle();

    ch.send({ text: "anything" });
    await settle();

    expect(errors[0]).toMatchObject({ code: 4001, message: "kicked" });
    expect(ch.status).toBe("disconnected");
  });
});

describe("a push subscription with a response schema", () => {
  function checkedPush(handler: (ctx: WSContext) => AsyncGenerator<unknown, void, unknown>) {
    return channel
      .response(z.object({ n: z.number(), unit: z.string().default("ms") }))
      .implement(handler as never);
  }

  it("sends each value as the schema produces it", async () => {
    const url = await serve(
      checkedPush(async function* () {
        yield { n: 1 };
        yield { n: 2, unit: "s" };
      }),
    );

    await expect(readAll(url)).resolves.toEqual([
      { n: 1, unit: "ms" },
      { n: 2, unit: "s" },
    ]);
  });

  it("fails the subscription with the schema's issues at the first value that does not match", async () => {
    const seen: unknown[] = [];
    const url = await serve(
      checkedPush(async function* () {
        yield { n: 1 };
        yield { n: "not-a-number" };
        yield { n: 3 };
      }),
    );

    const reading = (async () => {
      for await (const event of executeWSPush(url, "api.live.feed")) seen.push(event.data);
    })();
    const failure = await reading.catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(RealtimeValidationError);
    expect((failure as RealtimeValidationError).issues).toEqual([
      expect.objectContaining({ path: ["n"] }),
    ]);
    expect(seen).toEqual([{ n: 1, unit: "ms" }]);
  });
});
