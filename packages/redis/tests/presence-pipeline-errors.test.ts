import { describe, expect, it, vi } from "vitest";

import type { PresenceDiff } from "@noverax/courier/realtime";
import { createRedisPresence } from "../src/redis-presence";

/**
 * ioredis resolves `exec()` with `[error, result]` tuples and only rejects on
 * transport failure, so a client whose commands fail looks exactly like a
 * healthy one to any caller that awaits the pipeline without reading them.
 */
function createFailingRedis(failure: Error) {
  const pipe = {
    zadd: () => pipe,
    hset: () => pipe,
    zrem: () => pipe,
    hdel: () => pipe,
    exec: async (): Promise<[Error | null, unknown][]> => [
      [null, 1],
      [failure, null],
    ],
  };

  return {
    status: "ready",
    ping: async () => "PONG",
    on: () => undefined,
    off: () => undefined,
    pipeline: () => pipe,
    hget: async () => JSON.stringify({ userId: "alice", joinedAt: 1, metadata: {} }),
    zrangebyscore: async () => [],
    hmget: async () => [],
  };
}

// biome-ignore lint/suspicious/noExplicitAny: the mock stands in for an ioredis client
function presenceOver(redis: unknown) {
  return createRedisPresence({ redis: redis as any });
}

describe("presence writes that Redis refuses", () => {
  it("reports the failure instead of dropping it", async () => {
    const failure = new Error("OOM command not allowed when used memory > 'maxmemory'");
    const presence = presenceOver(createFailingRedis(failure));
    const onError = vi.fn();
    presence.onError(onError);
    await presence.connect();

    await presence.track("room:1", { userId: "alice", connectionId: "c1", metadata: {} });

    expect(onError).toHaveBeenCalledWith(failure);
  });

  it("does not announce a join that no later read could show", async () => {
    const presence = presenceOver(createFailingRedis(new Error("WRONGTYPE")));
    const diffs: PresenceDiff[] = [];
    presence.onError(() => undefined);
    presence.onDiff("room:1", (diff) => diffs.push(diff));
    await presence.connect();

    await presence.track("room:1", { userId: "alice", connectionId: "c1", metadata: {} });

    expect(diffs).toEqual([]);
  });

  it("does not announce a leave that did not happen", async () => {
    const presence = presenceOver(createFailingRedis(new Error("WRONGTYPE")));
    const diffs: PresenceDiff[] = [];
    presence.onError(() => undefined);
    presence.onDiff("room:1", (diff) => diffs.push(diff));
    await presence.connect();

    await presence.untrack("room:1", "c1");

    expect(diffs).toEqual([]);
  });
});
