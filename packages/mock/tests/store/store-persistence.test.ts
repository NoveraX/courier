/**
 * A store kept in a file: restored from it, every collection or only those
 * named; saved once for changes in quick succession, and not at all while
 * nothing changed; and a file that cannot be read, or a save that fails, is
 * reported without losing the store.
 */
import { mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createMockStore } from "../../src/store";
import { readStoreFile } from "../../src/store/store-file";
import { createStorePersistence } from "../../src/store/store-persistence";

const dirs: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function folder(): string {
  const dir = mkdtempSync(join(tmpdir(), "courier-store-persist-"));
  dirs.push(dir);
  return dir;
}

function file(): string {
  return join(folder(), "mocks", "users.json");
}

describe("a store kept in a file", () => {
  it("takes the records the file holds when restored, replacing those collections' seeds", async () => {
    const path = file();
    const first = createMockStore();
    first.collection("users").create({ id: 1, name: "Ada" });
    await createStorePersistence(first, { file: path }).flush();
    const second = createMockStore();
    second.collection("users").create({ id: 9, name: "Seed" });
    second.collection("posts").create({ id: 1 });

    createStorePersistence(second, { file: path }).restore();

    expect(second.collection("users").getAll()).toEqual([{ id: 1, name: "Ada" }]);
    expect(second.collection("posts").getAll()).toEqual([{ id: 1 }]);
  });

  it("takes only the collections named, leaving one no longer served behind", async () => {
    const path = file();
    const stored = createMockStore();
    stored.collection("users").create({ id: 1 });
    stored.collection("gone").create({ id: 1 });
    await createStorePersistence(stored, { file: path }).flush();
    const store = createMockStore();

    createStorePersistence(store, { file: path, collections: ["users"] }).restore();

    expect(store.list()).toEqual(["users"]);
  });

  it("is saved once for changes in quick succession, and not while nothing changed", async () => {
    const path = file();
    const store = createMockStore();
    const persistence = createStorePersistence(store, { file: path });
    store.collection("users").create({ id: 1 });
    persistence.schedule();
    store.collection("users").create({ id: 2 });
    persistence.schedule();
    await new Promise((resolve) => setTimeout(resolve, 400));
    const written = statSync(path).mtimeMs;

    await persistence.flush();
    await new Promise((resolve) => setTimeout(resolve, 20));
    await persistence.flush();

    expect(readStoreFile(path)).toEqual({ users: [{ id: 1 }, { id: 2 }] });
    expect(statSync(path).mtimeMs).toBe(written);
  });

  it("writes what is pending at once when flushed", async () => {
    const path = file();
    const store = createMockStore();
    const persistence = createStorePersistence(store, { file: path });
    store.collection("users").create({ id: 1 });
    persistence.schedule();

    await persistence.flush();

    expect(readStoreFile(path)).toEqual({ users: [{ id: 1 }] });
  });

  it("reports a file it cannot read and keeps the store's seeds", () => {
    const path = join(folder(), "broken.json");
    writeFileSync(path, "{ not json");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const store = createMockStore();
    store.collection("users").create({ id: 9 });

    createStorePersistence(store, { file: path }).restore();

    expect(store.collection("users").getAll()).toEqual([{ id: 9 }]);
    expect(warn).toHaveBeenCalled();
    expect(String(warn.mock.calls[0])).toContain("starts from its seeds");
  });

  it("reports a save that fails, and saves again at the next change", async () => {
    const blocked = join(folder(), "blocked");
    writeFileSync(blocked, "a file where a folder should be");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const store = createMockStore();
    const failing = createStorePersistence(store, { file: join(blocked, "users.json") });
    store.collection("users").create({ id: 1 });

    await failing.flush();

    expect(warn).toHaveBeenCalled();
    expect(String(warn.mock.calls[0])).toContain("could not be saved");
  });
});
