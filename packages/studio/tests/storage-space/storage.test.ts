/**
 * The Storage settings: what Studio keeps in `.courier/` and how much room
 * each part takes, and clearing parts of it.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { openStudioStores, type StudioStores } from "../../src/server/storage/studio-stores";
import { clearStorage } from "../../src/server/storage-space/clear-storage";
import { storageReport } from "../../src/server/storage-space/storage-report";

const cleanups: Array<() => void> = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
});

function project(): string {
  const root = mkdtempSync(join(tmpdir(), "courier-storage-"));
  cleanups.push(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

function filled(root: string): StudioStores {
  const stores = openStudioStores(root);
  cleanups.push(() => stores.close());
  for (const id of ["r1", "r2"]) {
    stores.requestLog.record({ type: "request:start", id, source: "api", method: "list" }, "s1");
    stores.requestLog.record({ type: "request:end", requestId: id, status: 200 }, "s1");
  }
  stores.mockLog.record({ type: "mock:request:start", requestId: "m1", serverId: "shop" });
  stores.playgroundHistory.replace([{ id: "p1" }, { id: "p2" }, { id: "p3" }]);
  stores.sessions.save({
    id: "s1",
    name: "Saved",
    savedAt: 1,
    startedAt: 1,
    duration: 0,
    requests: [],
    stats: { totalRequests: 0, successCount: 0, errorCount: 0, avgDuration: 0, sources: [] },
    apps: [],
  } as never);
  mkdirSync(join(root, ".courier", "mocks"), { recursive: true });
  writeFileSync(join(root, ".courier", "mocks", "shop-1234abcd.sqlite"), "x".repeat(4096));
  mkdirSync(join(root, ".courier", "backups", "1791173744326-00eb02a8"), { recursive: true });
  writeFileSync(
    join(root, ".courier", "backups", "1791173744326-00eb02a8", "a.ts"),
    "y".repeat(100),
  );
  return stores;
}

const kindOf = (stores: StudioStores, root: string, kind: string) =>
  storageReport(stores.storage.db, stores.storage.persistent, root).kinds.find(
    (k) => k.kind === kind,
  );

describe("the storage report", () => {
  it("sizes the database on disk and each part Studio keeps, with its limit", async () => {
    const root = project();
    const stores = filled(root);
    await new Promise((resolve) => setImmediate(resolve));

    const report = storageReport(stores.storage.db, true, root);

    expect(report.folder).toBe(".courier");
    expect(report.database.onDisk).toBeGreaterThan(0);
    expect(report.kinds.map((k) => [k.kind, k.count, k.limit])).toEqual([
      ["requests", 2, 2000],
      ["mockLogs", 1, 500],
      ["playground", 3, undefined],
      ["sessions", 1, undefined],
      ["mockStores", 1, undefined],
      ["backups", 1, undefined],
    ]);
    expect(report.kinds.every((k) => k.bytes > 0)).toBe(true);
  });
});

describe("clearing the storage", () => {
  it("empties what it names, leaves the rest, and goes back to the live requests", async () => {
    const root = project();
    const stores = filled(root);
    stores.view.showSession("s1");
    const resetMockStores = vi.fn(async () => {});

    await clearStorage(["requests", "sessions", "backups"], { stores, root, resetMockStores });

    expect(kindOf(stores, root, "requests")).toMatchObject({ count: 0, bytes: 0 });
    expect(kindOf(stores, root, "sessions")).toMatchObject({ count: 0, bytes: 0 });
    expect(kindOf(stores, root, "backups")).toMatchObject({ count: 0, bytes: 0 });
    expect(kindOf(stores, root, "playground")?.count).toBe(3);
    expect(stores.view.session()).toBeUndefined();
    expect(resetMockStores).not.toHaveBeenCalled();
  });

  it("resets the mocks' stores, the mocks' logs and the Playground's history when named", async () => {
    const root = project();
    const stores = filled(root);
    const resetMockStores = vi.fn(async () => {});

    await clearStorage(["mockLogs", "playground", "mockStores"], { stores, root, resetMockStores });

    expect(kindOf(stores, root, "mockLogs")?.count).toBe(0);
    expect(stores.playgroundHistory.entries()).toEqual([]);
    expect(resetMockStores).toHaveBeenCalledOnce();
  });
});
