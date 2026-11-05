/**
 * A limit on the connections of one key, as a handler applies it: keys
 * reach the store hashed, never as they are; a store that fails or does not
 * answer in time is not waited on — this replica decides by its own count,
 * and says so — and the leases held are renewed while any is held.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { createConnectionLimiter } from "../src/adapter/ws-connection-limit";
import { createRefusalLog } from "../src/logger/refusal-log";
import type { ConnectionLeaseStore } from "../src/realtime/adapters";
import { createMemoryConnectionLeases } from "../src/realtime/memory-leases";

const SECRET = "a-cluster-secret-of-32-bytes-or-more";
const rule = { key: (meta: Record<string, unknown>) => meta.userId as string | undefined, max: 2 };

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function limiter(
  store: ConnectionLeaseStore,
  extra: { secret?: string; timeoutMs?: number; renewEveryMs?: number } = {},
) {
  const refusals = createRefusalLog("WS");
  const warn = vi.spyOn(refusals, "warn");
  return {
    warn,
    limit: createConnectionLimiter({ rule, store, secret: extra.secret, refusals, ...extra }),
  };
}

function spiedStore(): ConnectionLeaseStore & { scopes: string[] } {
  const inner = createMemoryConnectionLeases();
  const scopes: string[] = [];
  return {
    scopes,
    acquire: vi.fn(async (scope, lease, leaseRule) => {
      scopes.push(scope);
      return inner.acquire(scope, lease, leaseRule);
    }),
    renew: vi.fn(async () => undefined),
    release: vi.fn(async (scope, lease) => inner.release(scope, lease)),
  };
}

describe("createConnectionLimiter", () => {
  it("puts a connection whose key is undefined under no limit", async () => {
    const store = spiedStore();
    const { limit } = limiter(store);

    expect(await limit.admit("c1", {})).toEqual([]);
    expect(store.acquire).not.toHaveBeenCalled();
  });

  it("gives up the oldest of a key's connections for a new one over the limit", async () => {
    const { limit } = limiter(createMemoryConnectionLeases());

    await limit.admit("c1", { userId: "u1" });
    await limit.admit("c2", { userId: "u1" });

    expect(await limit.admit("c3", { userId: "u1" })).toEqual(["c1"]);
    expect(await limit.admit("c4", { userId: "u2" })).toEqual([]);
  });

  it("hands the store the key hashed, never as it is, and with the secret's HMAC when there is one", async () => {
    const plain = spiedStore();
    const keyed = spiedStore();
    await limiter(plain).limit.admit("c1", { userId: "alice@example.com" });
    await limiter(keyed, { secret: SECRET }).limit.admit("c1", { userId: "alice@example.com" });

    for (const scope of [...plain.scopes, ...keyed.scopes]) {
      expect(scope).toMatch(/^key:[0-9a-f]{16}$/);
    }
    expect(keyed.scopes[0]).not.toBe(plain.scopes[0]);
  });

  it("lets a connection in by this replica's own count when the store fails, and says so", async () => {
    const failing: ConnectionLeaseStore = {
      acquire: async () => {
        throw new Error("ECONNREFUSED");
      },
      renew: async () => undefined,
      release: async () => undefined,
    };
    const { limit, warn } = limiter(failing);

    expect(await limit.admit("c1", { userId: "u1" })).toEqual([]);
    expect(await limit.admit("c2", { userId: "u1" })).toEqual([]);
    expect(await limit.admit("c3", { userId: "u1" })).toEqual(["c1"]);
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ code: "LEASES_UNAVAILABLE" }),
      expect.any(Error),
    );
  });

  it("does not wait on a store that does not answer past its deadline", async () => {
    const silent: ConnectionLeaseStore = {
      acquire: () => new Promise(() => undefined),
      renew: async () => undefined,
      release: async () => undefined,
    };
    const { limit } = limiter(silent, { timeoutMs: 50 });
    const started = Date.now();

    expect(await limit.admit("c1", { userId: "u1" })).toEqual([]);
    expect(Date.now() - started).toBeLessThan(1_000);
  });

  it("renews the leases it holds, and stops once it holds none", async () => {
    vi.useFakeTimers();
    const store = spiedStore();
    const { limit } = limiter(store, { renewEveryMs: 1_000 });
    await limit.admit("c1", { userId: "u1" });
    await limit.admit("c2", { userId: "u2" });

    await vi.advanceTimersByTimeAsync(1_000);
    expect(store.renew).toHaveBeenCalledWith([
      { scope: store.scopes[0], lease: "c1" },
      { scope: store.scopes[1], lease: "c2" },
    ]);

    limit.release("c1");
    limit.release("c2");
    await vi.advanceTimersByTimeAsync(5_000);
    expect(store.renew).toHaveBeenCalledTimes(1);
    expect(store.release).toHaveBeenCalledWith(store.scopes[0], "c1");
  });
});
