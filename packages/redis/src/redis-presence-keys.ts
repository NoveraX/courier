import type { PresenceEntry } from "@noverax/nexus/realtime";

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
redis.call('ZREM', KEYS[1], unpack(stale))
redis.call('HDEL', KEYS[2], unpack(stale))
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

/** Parse ZRANGEBYSCORE WITHSCORES flat array into id/score pairs */
export function parseScorePairs(raw: string[]): {
  connectionIds: string[];
  scores: Map<string, number>;
} {
  const connectionIds: string[] = [];
  const scores = new Map<string, number>();
  for (let i = 0; i < raw.length; i += 2) {
    const connId = raw[i];
    const score = raw[i + 1];
    if (!connId || !score) continue;
    connectionIds.push(connId);
    scores.set(connId, Number(score));
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
