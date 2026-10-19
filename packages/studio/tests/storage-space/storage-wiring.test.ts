import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Namespace } from "socket.io";
import { afterEach, describe, expect, it, vi } from "vitest";
import { openStudioStores } from "../../src/server/storage/studio-stores";
import { wireStorage } from "../../src/server/storage-space/storage-wiring";

const cleanups: Array<() => void> = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
  vi.useRealTimers();
});

function wired() {
  const root = mkdtempSync(join(tmpdir(), "courier-storage-wiring-"));
  const stores = openStudioStores(root);
  const emit = vi.fn();
  const mocks = { summarizeServers: () => [], forwardStoreCommand: () => undefined };
  const storage = wireStorage({
    stores,
    root,
    mocks,
    uiNamespace: { emit } as unknown as Namespace,
  });
  cleanups.push(() => rmSync(root, { recursive: true, force: true }));
  cleanups.push(() => stores.close());
  cleanups.push(() => storage.stop());
  return { storage, emit };
}

describe("Studio's storage, as its pages are told it", () => {
  it("sizes the database on disk", () => {
    const { storage } = wired();

    expect(storage.databaseSize()).toBeGreaterThan(0);
  });

  it("tells every page what a clear took, and the size after it", () => {
    const { storage, emit } = wired();

    storage.routes.announce(["requests"]);

    expect(emit).toHaveBeenCalledWith("storage:cleared", { kinds: ["requests"] });
    expect(emit).toHaveBeenCalledWith("storage:size", { onDisk: expect.any(Number) });
  });

  it("sends every page the live requests and their pins once the sessions are cleared", () => {
    const { storage, emit } = wired();

    storage.routes.announce(["sessions"]);

    expect(emit.mock.calls.map(([event]) => event).slice(0, 3)).toEqual([
      "storage:cleared",
      "events:replay",
      "requests:pinned",
    ]);
  });

  it("sends no live requests for a clear that leaves the sessions be", () => {
    const { storage, emit } = wired();

    storage.routes.announce(["requests", "mockLogs"]);

    expect(emit.mock.calls.map(([event]) => event)).not.toContain("events:replay");
  });

  it("tells every page the size every ten minutes, until stopped", () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const { storage, emit } = wired();

    vi.advanceTimersByTime(10 * 60_000);
    storage.stop();
    vi.advanceTimersByTime(10 * 60_000);

    expect(emit.mock.calls.filter(([event]) => event === "storage:size")).toHaveLength(1);
  });
});
