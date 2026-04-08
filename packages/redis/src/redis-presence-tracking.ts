/**
 * Mutation operations for the Redis presence adapter:
 * `track`, `update`, `untrack` and `heartbeat`.
 *
 * Each helper takes the shared {@link PresenceContext} so it can read the
 * underlying Redis client, key builders and event emitters without owning
 * any state of its own.
 */

import type { PresenceEntry } from "@noverax/nexus/realtime";
import type { PresenceContext } from "./redis-presence-emitters";
import { toError } from "./redis-presence-emitters";
import { packMeta, unpackMeta } from "./redis-presence-keys";

/** Add a connection to a topic and emit a `joins` diff. */
export async function trackEntry(
  ctx: PresenceContext,
  topic: string,
  entry: { userId: string; connectionId: string; metadata: Record<string, unknown> },
): Promise<void> {
  if (!ctx.isConnected()) return;
  const now = Date.now();
  try {
    const p = ctx.redis.pipeline();
    p.zadd(ctx.sk(topic), String(now), entry.connectionId);
    p.hset(
      ctx.mk(topic),
      entry.connectionId,
      packMeta({ userId: entry.userId, joinedAt: now, metadata: entry.metadata }),
    );
    await p.exec();
    const full: PresenceEntry = { ...entry, joinedAt: now, lastSeenAt: now };
    ctx.emitDiff(topic, { joins: [full], leaves: [] });
  } catch (err) {
    ctx.emitError(toError(err));
  }
}

/** Update an existing connection's metadata while preserving identity. */
export async function updateEntry(
  ctx: PresenceContext,
  topic: string,
  connectionId: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  if (!ctx.isConnected()) return;
  try {
    const raw = await ctx.redis.hget(ctx.mk(topic), connectionId);
    if (!raw) return;
    const existing = unpackMeta(raw);
    const now = Date.now();
    const p = ctx.redis.pipeline();
    p.zadd(ctx.sk(topic), String(now), connectionId);
    p.hset(
      ctx.mk(topic),
      connectionId,
      packMeta({ userId: existing.userId, joinedAt: existing.joinedAt, metadata }),
    );
    await p.exec();
  } catch (err) {
    ctx.emitError(toError(err));
  }
}

/** Remove a connection from a topic and emit a `leaves` diff. */
export async function untrackEntry(
  ctx: PresenceContext,
  topic: string,
  connectionId: string,
): Promise<void> {
  if (!ctx.isConnected()) return;
  try {
    const raw = await ctx.redis.hget(ctx.mk(topic), connectionId);
    if (!raw) return;
    const meta = unpackMeta(raw);
    const p = ctx.redis.pipeline();
    p.zrem(ctx.sk(topic), connectionId);
    p.hdel(ctx.mk(topic), connectionId);
    await p.exec();
    const entry: PresenceEntry = {
      userId: meta.userId,
      connectionId,
      metadata: meta.metadata,
      joinedAt: meta.joinedAt,
      lastSeenAt: Date.now(),
    };
    ctx.emitDiff(topic, { joins: [], leaves: [entry] });
  } catch (err) {
    ctx.emitError(toError(err));
  }
}

/** Refresh `lastSeenAt` for a still-active connection. */
export async function heartbeatEntry(
  ctx: PresenceContext,
  topic: string,
  connectionId: string,
): Promise<void> {
  if (!ctx.isConnected()) return;
  try {
    await ctx.redis.zadd(ctx.sk(topic), String(Date.now()), connectionId);
  } catch (err) {
    ctx.emitError(toError(err));
  }
}
