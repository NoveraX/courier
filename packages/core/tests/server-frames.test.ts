/**
 * What the client reads of a server's message: a frame whose fields hold,
 * a kind of frame it does not know, or a message that is not a frame. A
 * fuzz run feeds it random JSON and broken real frames; it never throws, and
 * hands on only frames whose fields are what they claim — a server's
 * heartbeat among them, which a timer has to be able to wait out.
 */
import { describe, expect, it } from "vitest";

import type { ServerFrame } from "../src/realtime/ws/server-frame-types";
import { readServerFrame } from "../src/realtime/ws/server-frames";

const frames: Record<string, ServerFrame> = {
  '{"type":"ping"}': { type: "ping" },
  '{"type":"pong"}': { type: "pong" },
  '{"type":"auth_ok","id":"a1","v":2,"connectionId":"c_7f3k","heartbeat":{"intervalMs":25000,"timeoutMs":10000},"limits":{"maxMessageSize":65536,"maxSubscriptions":100}}':
    {
      type: "auth_ok",
      id: "a1",
      v: 2,
      connectionId: "c_7f3k",
      heartbeat: { intervalMs: 25_000, timeoutMs: 10_000 },
      limits: { maxMessageSize: 65_536 },
    },
  '{"type":"auth_error","id":"a1","error":{"code":4429,"message":"Too many connections"},"v":2,"retryAfterMs":1500}':
    {
      type: "auth_error",
      id: "a1",
      error: { code: 4429, message: "Too many connections" },
      v: 2,
      retryAfterMs: 1_500,
    },
  '{"type":"auth_error","error":{"code":1002,"message":"Protocol version 2 required: reload the page"},"v":2}':
    {
      type: "auth_error",
      error: { code: 1002, message: "Protocol version 2 required: reload the page" },
      v: 2,
    },
  '{"type":"reauth_required","timeoutMs":0}': { type: "reauth_required", timeoutMs: 0 },
  '{"type":"disconnect","code":1001,"reason":"Server shutting down","retryAfterMs":2380}': {
    type: "disconnect",
    code: 1001,
    reason: "Server shutting down",
    retryAfterMs: 2_380,
  },
  '{"type":"renamed","topic":"api.room#{}","payload":"api.room"}': {
    type: "renamed",
    topic: "api.room#{}",
    to: "api.room",
  },
  '{"type":"subscribed","id":"sub-1","topic":"api.room"}': {
    type: "subscribed",
    id: "sub-1",
    topic: "api.room",
  },
  '{"type":"unsubscribed","topic":"api.room"}': { type: "unsubscribed", topic: "api.room" },
  '{"type":"complete","topic":"api.room","error":{"code":4403,"message":"No"}}': {
    type: "complete",
    topic: "api.room",
    error: { code: 4403, message: "No" },
  },
  '{"type":"data","topic":"api.room","payload":{"n":1},"seq":3}': {
    type: "data",
    topic: "api.room",
    payload: { n: 1 },
  },
  '{"type":"error","id":"sub-1","topic":"api.room","error":{"code":4422,"message":"Invalid","issues":[{}]}}':
    {
      type: "error",
      id: "sub-1",
      topic: "api.room",
      error: { code: 4422, message: "Invalid", issues: [{}] },
    },
};

describe("readServerFrame", () => {
  it.each(Object.entries(frames))("reads %s", (raw, frame) => {
    expect(readServerFrame(raw)).toEqual({ frame });
  });

  it("names a kind of frame it does not know rather than taking it for broken", () => {
    expect(readServerFrame('{"type":"auth_required"}')).toEqual({ unknown: "auth_required" });
    expect(readServerFrame('{"type":"__proto__"}')).toEqual({ unknown: "__proto__" });
  });

  it.each([
    ["not JSON", "{oops"],
    ["no type", '{"topic":"api.room"}'],
    ["no type", "[1,2]"],
    ["no type", '{"type":7}'],
    ["a subscribed frame", '{"type":"subscribed"}'],
    ["a subscribed frame", '{"type":"subscribed","topic":"api.room","id":5}'],
    ["a data frame", '{"type":"data","topic":{"room":"a"},"payload":1}'],
    ["a complete frame", '{"type":"complete","topic":"t","error":{"code":"4403","message":"No"}}'],
    ["a error frame", '{"type":"error","error":{"code":4.5,"message":"x"}}'],
    ["a error frame", '{"type":"error","error":{"code":1,"message":"x","issues":"many"}}'],
    ["a renamed frame", '{"type":"renamed","topic":"t","payload":{}}'],
    ["a auth_ok frame", authOk({ heartbeat: undefined })],
    ["a auth_ok frame", authOk({ heartbeat: { intervalMs: 0, timeoutMs: 10_000 } })],
    ["a auth_ok frame", authOk({ heartbeat: { intervalMs: 25_000, timeoutMs: 1.5 } })],
    ["a auth_ok frame", authOk({ heartbeat: { intervalMs: 2 ** 31 - 10, timeoutMs: 10 } })],
    ["a auth_ok frame", authOk({ limits: { maxMessageSize: -1 } })],
    ["a auth_ok frame", authOk({ v: "2" })],
    ["a auth_ok frame", authOk({ connectionId: 7 })],
    ["a auth_ok frame", authOk({ id: undefined })],
    ["a auth_error frame", '{"type":"auth_error","error":{"code":4401,"message":"No"}}'],
    ["a auth_error frame", '{"type":"auth_error","error":{"code":"4401","message":"No"},"v":2}'],
    [
      "a auth_error frame",
      '{"type":"auth_error","error":{"code":4429,"message":"No"},"v":2,"retryAfterMs":-1}',
    ],
    ["a reauth_required frame", '{"type":"reauth_required"}'],
    ["a reauth_required frame", '{"type":"reauth_required","timeoutMs":-5}'],
    ["a disconnect frame", '{"type":"disconnect","code":"1001","reason":"Going away"}'],
    ["a disconnect frame", '{"type":"disconnect","code":4409}'],
  ])("refuses %s: %s", (why, raw) => {
    expect(readServerFrame(raw)).toEqual({ invalid: why });
  });

  it("refuses a binary message", () => {
    expect(readServerFrame(new ArrayBuffer(4))).toEqual({ invalid: "a binary message" });
  });

  it("never throws on random JSON or broken real frames, and hands on only what holds", () => {
    const random = generator(20_261_105);
    const samples = [...Object.keys(frames)];
    for (let i = 0; i < 5_000; i++) {
      const raw =
        i % 2 === 0
          ? JSON.stringify(randomValue(random, 0))
          : mutate(random, samples[i % samples.length] ?? "");
      const reading = readServerFrame(raw);
      if ("frame" in reading) expect(holds(reading.frame), raw).toBe(true);
    }
  });
});

/* An auth_ok frame as a v2 server sends it, with `fields` in place of its own. */
function authOk(fields: Record<string, unknown>): string {
  return JSON.stringify({
    type: "auth_ok",
    id: "a1",
    v: 2,
    connectionId: "c1",
    heartbeat: { intervalMs: 25_000, timeoutMs: 10_000 },
    limits: { maxMessageSize: 65_536, maxSubscriptions: 100 },
    ...fields,
  });
}

/* Whether every field a frame names is what its type says it is. */
function holds(frame: ServerFrame): boolean {
  const optionalString = (value: unknown) => value === undefined || typeof value === "string";
  const wait = (value: unknown) => value === undefined || (typeof value === "number" && value >= 0);
  const fields: Record<string, unknown> = { ...frame };
  if (!optionalString(fields.id) || !optionalString(fields.topic)) return false;
  if ("to" in fields && typeof fields.to !== "string") return false;
  if ("v" in fields && !Number.isInteger(fields.v)) return false;
  if (!wait(fields.retryAfterMs) || !wait(fields.timeoutMs)) return false;
  if (frame.type === "auth_ok") {
    const { intervalMs, timeoutMs } = frame.heartbeat;
    const timer = Number.isInteger(intervalMs + timeoutMs) && intervalMs + timeoutMs < 2 ** 31;
    return timer && intervalMs > 0 && timeoutMs > 0 && frame.limits.maxMessageSize > 0;
  }
  if (frame.type === "disconnect") {
    return Number.isInteger(frame.code) && typeof frame.reason === "string";
  }
  if ("error" in fields && fields.error !== undefined) {
    const error = fields.error as Record<string, unknown>;
    return Number.isInteger(error.code) && typeof error.message === "string";
  }
  return true;
}

function generator(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TYPES = [
  "ping",
  "pong",
  "auth_ok",
  "auth_error",
  "reauth_required",
  "disconnect",
  "renamed",
  "subscribed",
  "unsubscribed",
  "complete",
  "data",
  "error",
  "x",
];
const KEYS = [
  ...["type", "id", "topic", "payload", "error", "code", "message", "issues", "seq", "v"],
  ...["connectionId", "heartbeat", "intervalMs", "timeoutMs", "limits", "maxMessageSize"],
  ...["retryAfterMs", "reason"],
];

function randomValue(random: () => number, depth: number): unknown {
  const pick = random();
  if (depth > 3 || pick < 0.2)
    return [null, true, 1.5, -3, "", "t", TYPES[Math.floor(random() * TYPES.length)]][
      Math.floor(random() * 7)
    ];
  if (pick < 0.35)
    return Array.from({ length: Math.floor(random() * 3) }, () => randomValue(random, depth + 1));
  const value: Record<string, unknown> = {};
  for (let i = Math.floor(random() * 5); i > 0; i--) {
    value[KEYS[Math.floor(random() * KEYS.length)] ?? "type"] = randomValue(random, depth + 1);
  }
  if (depth === 0 && random() < 0.7) value.type = TYPES[Math.floor(random() * TYPES.length)];
  return value;
}

/* A real frame with one character changed, dropped or doubled. */
function mutate(random: () => number, raw: string): string {
  const at = Math.floor(random() * raw.length);
  const kind = random();
  if (kind < 0.33) return raw.slice(0, at) + raw.slice(at + 1);
  if (kind < 0.66) return raw.slice(0, at) + raw[at] + raw.slice(at);
  return raw.slice(0, at) + String.fromCharCode(32 + Math.floor(random() * 90)) + raw.slice(at + 1);
}
