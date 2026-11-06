import { createHash, randomUUID } from "node:crypto";
import type { LoggedEvent, LogPosition, TopicLog } from "@noverax/courier/realtime";
import { ConfigurationError } from "@noverax/courier/server";
import type { Redis } from "ioredis";

import { defineScript, runScript } from "./redis-scripts";

/** How much of each topic a Redis log keeps. */
export interface RedisTopicLogOptions {
  /** Events kept a topic at most — trimmed as Redis trims a stream, a few more at times (default 100) */
  maxEvents?: number | undefined;
  /** How long a topic's sequence and events are kept after its last event, or a replica's last look at it (default 1 hour) */
  ttlMs?: number | undefined;
}

/** What a pub/sub adapter lends its log. */
export interface LogOutlet {
  /** The connection that publishes */
  readonly publisher: Redis;
  /** What its channels and keys are prefixed with */
  readonly prefix: string;
  /** The adapter's origin, which its envelopes carry */
  readonly origin: string;
  /** Run a command at once, or keep it while Redis is away, in order with what is published */
  dispatch(command: () => Promise<unknown>, bytes: number): Promise<void>;
}

/*
 * An event numbered, kept and published at once. A sequence begun anew —
 * Redis lost its keys, or never had them — takes the epoch offered, its
 * stream let go of; the envelope is put together here, so the payload
 * travels as its JSON, never decoded and encoded again.
 */
const APPEND = `
if redis.call("HSETNX", KEYS[1], "epoch", ARGV[1]) == 1 then redis.call("DEL", KEYS[2]) end
local epoch = redis.call("HGET", KEYS[1], "epoch")
local seq = string.format("%d", redis.call("HINCRBY", KEYS[1], "seq", 1))
redis.call("XADD", KEYS[2], "MAXLEN", "~", ARGV[2], seq .. "-0", "p", ARGV[6], "x", ARGV[8])
redis.call("PEXPIRE", KEYS[1], ARGV[3])
redis.call("PEXPIRE", KEYS[2], ARGV[3])
local logged = ',"logged":{"seq":' .. seq .. ',"epoch":' .. cjson.encode(epoch) .. ARGV[7] .. "}}"
redis.call("PUBLISH", ARGV[4], ARGV[5] .. ARGV[6] .. logged)
return seq
`;

/* Where a sequence stands, begun in the epoch offered when there is none. */
const POSITION = defineScript(`
if redis.call("HSETNX", KEYS[1], "epoch", ARGV[1]) == 1 then redis.call("DEL", KEYS[2]) end
redis.call("PEXPIRE", KEYS[1], ARGV[2])
redis.call("PEXPIRE", KEYS[2], ARGV[2])
return redis.call("HMGET", KEYS[1], "seq", "epoch")
`);

/* A range of the events kept, when the sequence is still the epoch read from. */
const READ = defineScript(`
if redis.call("HGET", KEYS[1], "epoch") ~= ARGV[1] then return false end
return redis.call("XRANGE", KEYS[2], ARGV[2], ARGV[3])
`);

/**
 * The log of a Redis pub/sub adapter: each topic's sequence in a hash, its
 * events in a stream, both under one hash tag — the topic's SHA-1, which
 * no brace in a topic can break — so a script can touch both on Redis
 * Cluster. An event is numbered, kept and published by one script, in the
 * order the adapter sends them; what a replica asks of the log is checked
 * before it is trusted.
 *
 * @param outlet - The adapter's publishing connection, prefix, origin and queue
 * @param options - How much of each topic it keeps
 * @returns The log
 * @throws ConfigurationError for a `maxEvents` that is no whole number of at least 1, or a `ttlMs` under 1000 ms
 * @example
 * ```ts
 * const log = createRedisTopicLog(outlet, { maxEvents: 100 });
 * await log.append('api.chat.room#{"room":"a"}', { text: "hi" });
 * ```
 */
export function createRedisTopicLog(outlet: LogOutlet, options: RedisTopicLogOptions): TopicLog {
  const { maxEvents = 100, ttlMs = 3_600_000 } = options;
  if (!Number.isSafeInteger(maxEvents) || maxEvents < 1) {
    refuse("maxEvents", maxEvents, "a whole number of at least 1");
  }
  if (!Number.isFinite(ttlMs) || ttlMs < 1_000) refuse("ttlMs", ttlMs, "1000 ms at least");
  const { publisher, prefix } = outlet;
  const ttl = String(Math.floor(ttlMs));
  const origin = JSON.stringify(outlet.origin);

  function keysOf(topic: string): string[] {
    const sequence = `${prefix}courier:log:{${createHash("sha1").update(topic).digest("hex")}}`;
    return [sequence, `${sequence}:events`];
  }

  return {
    append(topic, payload, exclude) {
      const json = JSON.stringify(payload) ?? "null";
      const envelope = `{"origin":${origin},"timestamp":${Date.now()},"payload":`;
      const left = exclude === undefined ? "" : `,"exclude":${JSON.stringify(exclude)}`;
      const args = [newEpoch(), String(maxEvents), ttl, prefix + topic, envelope, json, left];
      const keys = keysOf(topic);
      /* Sent whole each time: a fallback after NOSCRIPT could number two events out of order. */
      const command = () => publisher.eval(APPEND, 2, ...keys, ...args, exclude ?? "");
      return outlet.dispatch(command, Buffer.byteLength(json) + envelope.length);
    },
    async position(topic) {
      return positionOf(await runScript(publisher, POSITION, keysOf(topic), [newEpoch(), ttl]));
    },
    async read(topic, from, upTo) {
      if (upTo < from.seq || upTo - from.seq > maxEvents) return undefined;
      const args = [from.epoch, String(from.seq + 1), String(upTo)];
      const reply = await runScript(publisher, READ, keysOf(topic), args);
      const events = reply === null ? undefined : eventsOf(reply, from.epoch);
      const whole =
        events?.length === upTo - from.seq &&
        events.every((event, i) => event.seq === from.seq + 1 + i);
      return whole ? events : undefined;
    },
  };
}

function newEpoch(): string {
  return randomUUID().replaceAll("-", "").slice(0, 12);
}

function positionOf(reply: unknown): LogPosition {
  const [seq, epoch] = Array.isArray(reply) ? reply : [];
  const position = { seq: seq === null ? 0 : Number(seq), epoch };
  if (!Number.isSafeInteger(position.seq) || typeof epoch !== "string" || epoch === "") {
    throw new Error("The topic log's position in Redis is damaged");
  }
  return { seq: position.seq, epoch };
}

/* Each entry, `<seq>-0` with its payload's JSON and the connection it left out; none, for one damaged. */
function eventsOf(reply: unknown, epoch: string): LoggedEvent[] | undefined {
  if (!Array.isArray(reply)) return undefined;
  const events: LoggedEvent[] = [];
  for (const entry of reply) {
    const [id, fields] = Array.isArray(entry) ? entry : [];
    const seq = typeof id === "string" ? Number(id.split("-")[0]) : Number.NaN;
    if (!Number.isSafeInteger(seq) || !Array.isArray(fields)) return undefined;
    const field = new Map<unknown, unknown>();
    for (let i = 0; i + 1 < fields.length; i += 2) field.set(fields[i], fields[i + 1]);
    const exclude = field.get("x");
    try {
      const payload: unknown = JSON.parse(String(field.get("p")));
      events.push({ seq, epoch, payload, ...(exclude ? { exclude: String(exclude) } : {}) });
    } catch {
      return undefined;
    }
  }
  return events;
}

function refuse(name: string, value: unknown, takes: string): never {
  throw new ConfigurationError(
    "PUBSUB_OPTIONS_INVALID",
    `[courier] createRedisPubSub({ log: { ${name} } }) takes ${takes}, not ${String(value)}.`,
  );
}
