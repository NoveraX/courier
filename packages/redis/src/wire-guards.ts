/**
 * Checks for what is read back from Redis.
 *
 * Another process can publish on the same channel or write under the same
 * key, and a record may be damaged; each value is checked before it is read,
 * so a stranger's message is reported instead of reaching a handler as an
 * event, and a damaged record fails as one.
 */

import type { PresenceDiff, PresenceEntry, PubSubEnvelope } from "@noverax/courier/realtime";
import type { PackedMeta } from "./redis-presence-keys";

/** What a replica publishes for the others when presence on a topic changes. */
export interface DiffEnvelope {
  origin: string;
  topic: string;
  diff: PresenceDiff;
}

/**
 * Whether a message is an envelope a replica published.
 *
 * @param value - The message, parsed
 * @returns Whether it names its origin and carries a payload
 * @example
 * ```ts
 * isPubSubEnvelope({ origin: "a1", payload: { text: "hi" }, timestamp: 1 }); // true
 * isPubSubEnvelope("hi"); // false
 * ```
 */
export function isPubSubEnvelope(value: unknown): value is PubSubEnvelope {
  return isRecord(value) && typeof value.origin === "string" && "payload" in value;
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
