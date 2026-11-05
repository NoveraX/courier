/**
 * Connection leases in memory: granted up to a scope's limit, then the
 * oldest given up for a new one, or the new one refused; each scope on its
 * own, and a place freed when a lease is released.
 */
import { describe, expect, it } from "vitest";

import { createMemoryConnectionLeases } from "../src/realtime/memory-leases";

const evictOldest = { max: 2, onExceed: "evict-oldest" } as const;
const reject = { max: 2, onExceed: "reject" } as const;

describe("createMemoryConnectionLeases", () => {
  it("grants leases up to the limit, then gives up the oldest for each new one", async () => {
    const leases = createMemoryConnectionLeases();

    expect(await leases.acquire("key:a", "c1", evictOldest)).toEqual({ admitted: true, evict: [] });
    expect(await leases.acquire("key:a", "c2", evictOldest)).toEqual({ admitted: true, evict: [] });
    expect(await leases.acquire("key:a", "c3", evictOldest)).toEqual({
      admitted: true,
      evict: ["c1"],
    });
    expect(await leases.acquire("key:a", "c4", evictOldest)).toEqual({
      admitted: true,
      evict: ["c2"],
    });
  });

  it("refuses a new lease over the limit, when the rule says to", async () => {
    const leases = createMemoryConnectionLeases();
    await leases.acquire("key:a", "c1", reject);
    await leases.acquire("key:a", "c2", reject);

    expect(await leases.acquire("key:a", "c3", reject)).toEqual({ admitted: false });
  });

  it("keeps each scope apart, and takes a lease it holds again as held", async () => {
    const leases = createMemoryConnectionLeases();
    await leases.acquire("key:a", "c1", reject);
    await leases.acquire("key:a", "c2", reject);

    expect(await leases.acquire("key:b", "c3", reject)).toEqual({ admitted: true, evict: [] });
    expect(await leases.acquire("key:a", "c2", reject)).toEqual({ admitted: true, evict: [] });
  });

  it("frees a place once a lease is released", async () => {
    const leases = createMemoryConnectionLeases();
    await leases.acquire("key:a", "c1", reject);
    await leases.acquire("key:a", "c2", reject);

    await leases.release("key:a", "c1");

    expect(await leases.acquire("key:a", "c3", reject)).toEqual({ admitted: true, evict: [] });
  });

  it("gives up as many as it takes to make room, when the limit was lowered", async () => {
    const leases = createMemoryConnectionLeases();
    for (const lease of ["c1", "c2", "c3"]) {
      await leases.acquire("key:a", lease, { max: 3, onExceed: "evict-oldest" });
    }

    expect(await leases.acquire("key:a", "c4", { max: 1, onExceed: "evict-oldest" })).toEqual({
      admitted: true,
      evict: ["c1", "c2", "c3"],
    });
  });
});
