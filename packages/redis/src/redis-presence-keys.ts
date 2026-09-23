import type { PresenceEntry } from "@noverax/courier/realtime";

/** Packed metadata stored in Redis HASH — userId + joinedAt + user metadata */
export interface PackedMeta {
  userId: string;
  joinedAt: number;
  metadata: Record<string, unknown>;
}

/**
 * Lua script for atomic sweep: get stale entries + remove from ZSET + HDEL metadata.
 *
 * KEYS[1] = score key (ZSET), KEYS[2] = meta key (HASH)
 * ARGV[1] = cutoff timestamp (entries with score ≤ cutoff are stale)
 *
 * Returns flat array of [connectionId, jsonMeta, connectionId, jsonMeta, ...]
 *
 * Removes in batches: Lua's `unpack` stops at 8000 values, and one call for
 * the whole set failed from then on — the topic could never be cleaned, and
 * each sweep reported nothing to clean.
 */
export const SWEEP_LUA = `
local stale = redis.call('ZRANGEBYSCORE', KEYS[1], '-inf', ARGV[1])
if #stale == 0 then return {} end
local result = {}
for i, connId in ipairs(stale) do
  local meta = redis.call('HGET', KEYS[2], connId)
  result[#result + 1] = connId
  result[#result + 1] = meta or '{}'
end
for i = 1, #stale, 5000 do
  local batch = {unpack(stale, i, math.min(i + 4999, #stale))}
  redis.call('ZREM', KEYS[1], unpack(batch))
  redis.call('HDEL', KEYS[2], unpack(batch))
end
return result
`;

/** Build ZSET key for topic scores (lastSeenAt) */
export function scoreKey(prefix: string, topic: string): string {
  return `${prefix}score:${topic}`;
}

/** Build HASH key for topic metadata */
export function metaKey(prefix: string, topic: string): string {
  return `${prefix}meta:${topic}`;
}

/** Pack userId + joinedAt + metadata into a single JSON string for HSET */
export function packMeta(entry: PackedMeta): string {
  return JSON.stringify({
    userId: entry.userId,
    joinedAt: entry.joinedAt,
    metadata: entry.metadata,
  });
}

/** Unpack HGET result into partial PresenceEntry fields */
export function unpackMeta(raw: string): PackedMeta {
  return JSON.parse(raw) as PackedMeta;
}

/** One ZRANGEBYSCORE WITHSCORES reply element, in either protocol's shape */
export type ScoreReplyElement = string | readonly [string, string | number];

/**
 * Parse a ZRANGEBYSCORE WITHSCORES reply into id/score pairs.
 *
 * RESP2 answers with a flat `[member, score, member, score, …]` array; RESP3
 * answers with `[[member, score], …]`. A client speaking either protocol
 * reaches this function, so both shapes are read rather than one being
 * assumed — under the wrong assumption every entry is silently dropped and
 * a populated topic reports nobody present.
 */
export function parseScorePairs(raw: readonly ScoreReplyElement[]): {
  connectionIds: string[];
  scores: Map<string, number>;
} {
  const connectionIds: string[] = [];
  const scores = new Map<string, number>();

  const record = (connId: string | undefined, score: string | number | undefined): void => {
    if (!connId || score === undefined || score === "") return;
    connectionIds.push(connId);
    scores.set(connId, Number(score));
  };

  if (Array.isArray(raw[0])) {
    for (const pair of raw as readonly (readonly [string, string | number])[]) {
      record(pair[0], pair[1]);
    }
    return { connectionIds, scores };
  }

  const flat = raw as readonly string[];
  for (let i = 0; i < flat.length; i += 2) {
    record(flat[i], flat[i + 1]);
  }
  return { connectionIds, scores };
}

/** Build PresenceEntry[] from connection IDs, metadata values, and scores */
export function buildEntries(
  connectionIds: string[],
  metaValues: (string | null)[],
  scores: Map<string, number>,
): PresenceEntry[] {
  const entries: PresenceEntry[] = [];
  for (let i = 0; i < connectionIds.length; i++) {
    const connId = connectionIds[i];
    if (!connId) continue;
    const metaRaw = metaValues[i];
    if (!metaRaw) continue;
    const meta = unpackMeta(metaRaw);
    entries.push({
      userId: meta.userId,
      connectionId: connId,
      metadata: meta.metadata,
      joinedAt: meta.joinedAt,
      lastSeenAt: scores.get(connId) ?? 0,
    });
  }
  return entries;
}
