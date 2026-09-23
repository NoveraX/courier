/**
 * Mutation operations for the Redis presence adapter:
 * `track`, `update`, `untrack` and `heartbeat`.
 *
 * Each helper takes the shared {@link PresenceContext} so it can read the
 * underlying Redis client, key builders and event emitters without owning
 * any state of its own.
 */

import type { PresenceEntry } from "@noverax/courier/realtime";
import type { PresenceContext } from "./redis-presence-emitters";
import { toError } from "./redis-presence-emitters";
import { packMeta, unpackMeta } from "./redis-presence-keys";

/**
 * Run a pipeline and report the first command that failed.
 *
 * ioredis resolves `exec()` with `[error, result]` tuples and only rejects for
 * transport-level problems, so a rejected ZADD or HSET never reaches a
 * `catch`. Without this, a write that Redis refused would still be announced
 * as a join that no later `list()` can show.
 */
async function runPipeline(
  ctx: PresenceContext,
  pipeline: ReturnType<PresenceContext["redis"]["pipeline"]>,
): Promise<boolean> {
  const results = await pipeline.exec();
  for (const [err] of results ?? []) {
    if (err) {
      ctx.emitError(toError(err));
      return false;
    }
  }
  return true;
}

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
    if (!(await runPipeline(ctx, p))) return;
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
    await runPipeline(ctx, p);
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
    if (!(await runPipeline(ctx, p))) return;
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
    /* XX: refresh a member, never add one. A heartbeat that came after a
       sweep used to put the connection back without its metadata, so it
       vanished from every roster and could not be untracked. */
    await ctx.redis.zadd(ctx.sk(topic), "XX", String(Date.now()), connectionId);
  } catch (err) {
    ctx.emitError(toError(err));
  }
}
