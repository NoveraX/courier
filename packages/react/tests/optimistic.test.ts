import { beforeEach, describe, expect, it, vi } from "vitest";
import { optimisticOptions } from "../src/optimistic";

// --- Minimal QueryClient mock ---

function createMockQueryClient() {
  const cache = new Map<string, unknown>();
  const keyStr = (key: unknown[]) => JSON.stringify(key);

  return {
    cancelQueries: vi.fn().mockResolvedValue(undefined),
    getQueryData: vi.fn(<T>(key: unknown[]) => cache.get(keyStr(key)) as T | undefined),
    setQueryData: vi.fn(<T>(key: unknown[], updaterOrValue: T | ((old: T | undefined) => T)) => {
      if (typeof updaterOrValue === "function") {
        const current = cache.get(keyStr(key)) as T | undefined;
        cache.set(keyStr(key), (updaterOrValue as (old: T | undefined) => T)(current));
      } else {
        cache.set(keyStr(key), updaterOrValue);
      }
    }),
    invalidateQueries: vi.fn(),
    // Helper to seed cache
    _seed(key: unknown[], value: unknown) {
      cache.set(keyStr(key), value);
    },
  };
}

type User = { id: number; name: string };

const QUERY_KEY = ["api", "users", "getAll"];

let qc: ReturnType<typeof createMockQueryClient>;

beforeEach(() => {
  qc = createMockQueryClient();
});

describe("optimisticOptions", () => {
  it("returns onMutate, onError, and onSettled callbacks", () => {
    const opts = optimisticOptions(qc as any, {
      queryKey: QUERY_KEY,
      updater: (old: User[] | undefined) => old ?? [],
    });

    expect(typeof opts.onMutate).toBe("function");
    expect(typeof opts.onError).toBe("function");
    expect(typeof opts.onSettled).toBe("function");
  });

  it("cancels queries and sets optimistic data on mutate", async () => {
    const original: User[] = [{ id: 1, name: "Alice" }];
    qc._seed(QUERY_KEY, original);

    const opts = optimisticOptions<User[], { name: string }>(qc as any, {
      queryKey: QUERY_KEY,
      updater: (old, vars) => [...(old ?? []), { id: 999, name: vars.name }],
    });

    await opts.onMutate({ name: "Bob" });

    expect(qc.cancelQueries).toHaveBeenCalledWith({ queryKey: QUERY_KEY });
    expect(qc.setQueryData).toHaveBeenCalled();
  });

  it("returns previous data as context from onMutate", async () => {
    const original: User[] = [{ id: 1, name: "Alice" }];
    qc._seed(QUERY_KEY, original);

    const opts = optimisticOptions<User[], { name: string }>(qc as any, {
      queryKey: QUERY_KEY,
      updater: (old, vars) => [...(old ?? []), { id: 2, name: vars.name }],
    });

    const context = await opts.onMutate({ name: "Bob" });

    expect(context._previousData).toEqual(original);
  });

  it("rolls back cache on error using context", async () => {
    const original: User[] = [{ id: 1, name: "Alice" }];
    qc._seed(QUERY_KEY, original);

    const opts = optimisticOptions<User[], { name: string }>(qc as any, {
      queryKey: QUERY_KEY,
      updater: (old, vars) => [...(old ?? []), { id: 999, name: vars.name }],
    });

    const context = await opts.onMutate({ name: "Bob" });
    opts.onError(new Error("fail") as any, { name: "Bob" }, context);

    expect(qc.setQueryData).toHaveBeenCalledWith(QUERY_KEY, original);
  });

  it("does not roll back when context is undefined", () => {
    const opts = optimisticOptions<User[], { name: string }>(qc as any, {
      queryKey: QUERY_KEY,
      updater: (old) => old ?? [],
    });

    // Should not throw
    opts.onError(new Error("fail") as any, { name: "Bob" }, undefined);

    // setQueryData not called for rollback (only if context._previousData !== undefined)
    expect(qc.setQueryData).not.toHaveBeenCalled();
  });

  it("invalidates queries on settled", () => {
    const opts = optimisticOptions<User[], { name: string }>(qc as any, {
      queryKey: QUERY_KEY,
      updater: (old) => old ?? [],
    });

    opts.onSettled();

    expect(qc.invalidateQueries).toHaveBeenCalledWith({ queryKey: QUERY_KEY });
  });

  it("handles undefined previous data gracefully", async () => {
    // No data seeded — getQueryData returns undefined
    const opts = optimisticOptions<User[], { name: string }>(qc as any, {
      queryKey: QUERY_KEY,
      updater: (old, vars) => [...(old ?? []), { id: 1, name: vars.name }],
    });

    const context = await opts.onMutate({ name: "Alice" });

    expect(context._previousData).toBeUndefined();
  });
});
