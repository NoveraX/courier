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
  /* A message to a room of pages is told by the room it went to, one to a page by the page: a page
     with the token is open, and one without it. */
  const to = (room: string) => ({
    emit: (event: string, payload: unknown) => emit(`${event} to ${room}`, payload),
  });
  const reader = {
    id: "reader",
    rooms: new Set(["pages:read-only"]),
    emit: (event: string, payload: unknown) =>
      emit(`${event} to a page without the token`, payload),
  };
  const uiNamespace = {
    emit,
    to,
    adapter: {
      rooms: new Map([
        ["pages:token", new Set(["owner"])],
        ["pages:read-only", new Set([reader.id])],
      ]),
    },
    sockets: new Map([[reader.id, reader]]),
  };
  const mocks = { summarizeServers: () => [], forwardStoreCommand: () => undefined };
  const storage = wireStorage({
    stores,
    root,
    mocks,
    uiNamespace: uiNamespace as unknown as Namespace,
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

  it("sends every page the live requests, and their pins after them, once the sessions are cleared", async () => {
    const { storage, emit } = wired();

    storage.routes.announce(["sessions"]);
    /* A page without the token is sent the replay once its log is cut, and the pins after it. */
    await vi.waitFor(() =>
      expect(emit.mock.calls.map(([event]) => event)).toContain("requests:pinned"),
    );

    expect(
      emit.mock.calls.map(([event]) => event).filter((event) => event !== "storage:size"),
    ).toEqual([
      "storage:cleared",
      "events:replay to pages:token",
      "events:replay to a page without the token",
      "requests:pinned",
    ]);
  });

  it("sends no live requests for a clear that leaves the sessions be", () => {
    const { storage, emit } = wired();

    storage.routes.announce(["requests", "mockLogs"]);

    expect(emit.mock.calls.map(([event]) => String(event).split(" ")[0])).not.toContain(
      "events:replay",
    );
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
