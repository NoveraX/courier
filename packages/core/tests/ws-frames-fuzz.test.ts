/**
 * Whatever clients send a WebSocket handler — any JSON, frames of every
 * type with fields of any kind, text cut short, frames over the size limit
 * — it throws nothing out of a socket's listener, rejects no promise no one
 * awaits, closes a socket only with a code a socket can send, and goes on
 * serving a client that speaks the protocol.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createWSHandler } from "../src/adapter/handle-ws";
import { isSendableCloseCode } from "../src/adapter/ws-close";
import type { WSHandler } from "../src/adapter/ws-types";
import { courier } from "../src/define/courier";
import type { Sources } from "../src/define/types";
import { qualifyTopic } from "../src/realtime/ws/topic-key";
import { encodeMessage } from "../src/realtime/ws/ws-protocol";
import { _resetSourcesForTests, registerSources } from "../src/server/sources";
import { authFrame, createFakeSocket } from "./helpers/fake-socket";
import { randomFrame, randomText, randomValue } from "./helpers/random-frames";
import { seededRandom } from "./helpers/seeded-random";

const { channel } = courier();
const room = channel
  .send<string>()
  .response<string>()
  .implement(() => ({ onMessage: () => undefined }));
const TOPICS = [qualifyTopic("api.live.room", {}), qualifyTopic("api.live.room", { room: "a" })];
const MAX_MESSAGE_SIZE = 4_096;

let handler: WSHandler | undefined;

beforeEach(() => {
  for (const level of ["warn", "error", "info"] as const) {
    vi.spyOn(console, level).mockImplementation(() => undefined);
  }
  registerSources({
    api: { options: { expose: true, groups: { live: { options: {}, room } } } },
  } as Sources);
});

afterEach(async () => {
  await handler?.destroy({ timeoutMs: 100 });
  handler = undefined;
  _resetSourcesForTests();
  vi.restoreAllMocks();
});

/** What a client might put on the wire: a frame, any JSON, text cut short, or too much of it. */
function anything(random: () => number): string {
  const roll = random();
  if (roll < 0.55) return encodeMessage(randomFrame(random, TOPICS));
  if (roll < 0.75) return JSON.stringify(randomValue(random, 3)) ?? "null";
  if (roll < 0.95)
    return encodeMessage(randomFrame(random, TOPICS)).slice(0, Math.floor(random() * 30));
  return `{"type":"message","payload":"${"x".repeat(MAX_MESSAGE_SIZE)}"}${randomText(random)}`;
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 5));

describe("a WebSocket handler sent anything", () => {
  it.each([
    ["taking credentials sent again, so each socket hears every frame", { onReauth: () => ({}) }],
    ["with no onReauth, closing a socket that sends credentials again", {}],
  ])(
    "throws nothing, closes only with codes a socket can send, and goes on serving, %s",
    async (_case, extra) => {
      handler = createWSHandler({
        heartbeatIntervalMs: 60_000,
        maxMessageSize: MAX_MESSAGE_SIZE,
        maxMessagesPerSecond: 1_000_000,
        maxConnectionsPerIP: 1_000,
        ...extra,
      });
      const random = seededRandom(0xf022);

      for (let client = 0; client < 25; client++) {
        const socket = createFakeSocket();
        handler.handleSocket(socket, new Request("http://localhost/api/ws"), "203.0.113.7");
        socket.receive(authFrame());
        for (let frame = 0; frame < 120 && socket.closed === undefined; frame++) {
          expect(() => socket.emit("message", { data: anything(random) })).not.toThrow();
          if (frame % 20 === 0) await settle();
        }
        await settle();
        if (socket.closed) expect(isSendableCloseCode(socket.closed.code ?? 1005)).toBe(true);
      }

      const healthy = createFakeSocket();
      handler.handleSocket(healthy, new Request("http://localhost/api/ws"), "198.51.100.1");
      healthy.receive(authFrame());
      healthy.receive({ type: "subscribe", id: "s1", topic: TOPICS[0] ?? "" });
      await expect
        .poll(() => healthy.sent)
        .toContainEqual(expect.objectContaining({ type: "subscribed", id: "s1" }));
    },
  );
});
