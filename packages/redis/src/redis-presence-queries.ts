/**
 * Read and maintenance operations for the Redis presence adapter:
 * `list` (snapshot of active connections) and `sweep` (atomic eviction
 * of stale entries via Lua script).
 */

import type { PresenceEntry } from "@noverax/courier/realtime";
import type { PresenceContext } from "./redis-presence-emitters";
import { toError } from "./redis-presence-emitters";
import { buildEntries, parseScorePairs, SWEEP_LUA, unpackMeta } from "./redis-presence-keys";

/** Return all active presence entries for a topic. */
export async function listEntries(ctx: PresenceContext, topic: string): Promise<PresenceEntry[]> {
  if (!ctx.isConnected()) return [];
  try {
    const raw = await ctx.redis.zrangebyscore(ctx.sk(topic), "-inf", "+inf", "WITHSCORES");
    if (raw.length === 0) return [];
    const { connectionIds, scores } = parseScorePairs(raw);
    const metaValues = await ctx.redis.hmget(ctx.mk(topic), ...connectionIds);
    return buildEntries(connectionIds, metaValues, scores);
  } catch (err) {
    ctx.emitError(toError(err));
    return [];
  }
}

/**
 * Atomically evict entries whose `lastSeenAt` is older than `staleThresholdMs`.
 * Emits a `leaves` diff for every swept connection so subscribers stay in sync.
 */
export async function sweepEntries(
  ctx: PresenceContext,
  topic: string,
  staleThresholdMs: number,
): Promise<PresenceEntry[]> {
  if (!ctx.isConnected()) return [];
  const cutoff = Date.now() - staleThresholdMs;
  try {
    const raw = (await ctx.redis.eval(
      SWEEP_LUA,
      2,
      ctx.sk(topic),
      ctx.mk(topic),
      String(cutoff),
    )) as string[];
    if (raw.length === 0) return [];
    const swept = parseSweptEntries(raw, cutoff);
    if (swept.length > 0) ctx.emitDiff(topic, { joins: [], leaves: swept });
    return swept;
  } catch (err) {
    ctx.emitError(toError(err));
    return [];
  }
}

/** Convert a flat `[connId, metaJson, ...]` Lua result into PresenceEntry[]. */
function parseSweptEntries(raw: string[], cutoff: number): PresenceEntry[] {
  const swept: PresenceEntry[] = [];
  for (let i = 0; i < raw.length; i += 2) {
    const connId = raw[i];
    const metaStr = raw[i + 1];
    if (!connId || !metaStr) continue;
    const meta = unpackMeta(metaStr);
    swept.push({
      userId: meta.userId,
      connectionId: connId,
      metadata: meta.metadata,
      joinedAt: meta.joinedAt,
      lastSeenAt: cutoff,
    });
  }
  return swept;
}
