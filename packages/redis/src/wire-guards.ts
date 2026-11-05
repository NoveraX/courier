/**
 * Checks for what is read back from Redis.
 *
 * Another process can publish on the same channel or write under the same
 * key, and a record may be damaged; each value is checked before it is read,
 * so a stranger's message is reported instead of reaching a handler as an
 * event, and a damaged record fails as one.
 */

import type {
  LoggedPosition,
  PresenceDiff,
  PresenceEntry,
  PubSubEnvelope,
} from "@noverax/courier/realtime";
import type { PackedMeta } from "./redis-presence-keys";

/** What a replica publishes for the others when presence on a topic changes. */
export interface DiffEnvelope {
  origin: string;
  topic: string;
  diff: PresenceDiff;
}

/** The longest epoch, and connection id, a logged envelope may name. */
const MAX_NAME_LENGTH = 64;

/**
 * Whether a message is an envelope a replica published: one that names
 * its origin and carries a payload, and — when a log numbered it — a whole
 * position in the topic's sequence.
 *
 * @param value - The message, parsed
 * @returns Whether it is one
 * @example
 * ```ts
 * isPubSubEnvelope({ origin: "a1", payload: { text: "hi" }, timestamp: 1 }); // true
 * isPubSubEnvelope({ origin: "a1", payload: 1, logged: { seq: 0, epoch: "e" } }); // false
 * isPubSubEnvelope("hi"); // false
 * ```
 */
export function isPubSubEnvelope(value: unknown): value is PubSubEnvelope {
  return (
    isRecord(value) &&
    typeof value.origin === "string" &&
    "payload" in value &&
    (value.logged === undefined || isLoggedPosition(value.logged))
  );
}

function isLoggedPosition(value: unknown): value is LoggedPosition {
  return (
    isRecord(value) &&
    Number.isSafeInteger(value.seq) &&
    (value.seq as number) >= 1 &&
    isName(value.epoch) &&
    (value.exclude === undefined || isName(value.exclude))
  );
}

function isName(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_NAME_LENGTH;
}

/**
 * The envelope a message on a pub/sub channel carries, when it is one.
 *
 * @param raw - The message as Redis delivered it
 * @returns The envelope; `undefined` for a message that is not JSON, or no envelope
 * @example
 * ```ts
 * envelopeOf('{"origin":"a1","payload":"hi","timestamp":1}'); // { origin: "a1", payload: "hi", timestamp: 1 }
 * envelopeOf("hi"); // undefined
 * ```
 */
export function envelopeOf(raw: string): PubSubEnvelope | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    /* Not JSON, so no envelope: the caller reports it as any stranger's message. */
    return undefined;
  }
  return isPubSubEnvelope(parsed) ? parsed : undefined;
}

/**
 * Whether a message is a presence change a replica published.
 *
 * @param value - The message, parsed
 * @returns Whether it names its origin and topic, and lists whole entries
 * @example
 * ```ts
 * isDiffEnvelope({ origin: "a1", topic: "room", diff: { joins: [], leaves: [] } }); // true
 * ```
 */
export function isDiffEnvelope(value: unknown): value is DiffEnvelope {
  return (
    isRecord(value) &&
    typeof value.origin === "string" &&
    typeof value.topic === "string" &&
    isRecord(value.diff) &&
    isEntryList(value.diff.joins) &&
    isEntryList(value.diff.leaves)
  );
}

/**
 * Whether a stored value is the record kept for one connection's presence.
 *
 * @param value - The stored value, parsed
 * @returns Whether it holds a user, a join time and metadata
 * @example
 * ```ts
 * isPackedMeta({ userId: "u1", joinedAt: 1, metadata: {} }); // true
 * ```
 */
export function isPackedMeta(value: unknown): value is PackedMeta {
  return (
    isRecord(value) &&
    typeof value.userId === "string" &&
    typeof value.joinedAt === "number" &&
    isRecord(value.metadata)
  );
}

function isEntryList(value: unknown): value is PresenceEntry[] {
  return Array.isArray(value) && value.every(isEntry);
}

function isEntry(value: unknown): value is PresenceEntry {
  return (
    isRecord(value) &&
    typeof value.userId === "string" &&
    typeof value.connectionId === "string" &&
    typeof value.joinedAt === "number" &&
    typeof value.lastSeenAt === "number" &&
    isRecord(value.metadata)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
