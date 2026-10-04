/**
 * A store kept in an SQLite file: restored from it, every collection or only
 * those named; saved once for changes in quick succession, not at all while
 * nothing changed, an edit made in place and an emptied collection included;
 * and a file that cannot be read or opened, a runtime without SQLite, or a
 * save that fails, is reported without losing the store.
 */
import { mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createMockStore, type MockStore } from "../../src/store";
import { openStoreDatabase } from "../../src/store/store-database";
import { createStorePersistence, type StorePersistence } from "../../src/store/store-persistence";

const dirs: string[] = [];
const kept: StorePersistence[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  for (const persistence of kept.splice(0)) await persistence.close();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function folder(): string {
  const dir = mkdtempSync(join(tmpdir(), "courier-store-persist-"));
  dirs.push(dir);
  return dir;
}

function file(): string {
  return join(folder(), "mocks", "users.sqlite");
}

function persist(
  store: MockStore,
  options: Parameters<typeof createStorePersistence>[1],
  open?: Parameters<typeof createStorePersistence>[2],
) {
  const persistence = createStorePersistence(store, options, open);
  kept.push(persistence);
  return persistence;
}

/** What the file holds, read through a connection of the test's own. */
function stored(path: string): Record<string, unknown[]> {
  const db = new DatabaseSync(path);
  try {
    const held: Record<string, unknown[]> = {};
    for (const { name } of db.prepare("SELECT name FROM collections").all())
      held[String(name)] = [];
    for (const { collection, data } of db
      .prepare("SELECT collection, data FROM records ORDER BY collection, position")
      .all()) {
      held[String(collection)]?.push(JSON.parse(String(data)));
    }
    return held;
  } finally {
    db.close();
  }
}

/** A store saved to `path` with these users, its file let go. */
async function savedWith(path: string, users: Record<string, unknown>[]): Promise<void> {
  const store = createMockStore();
  for (const user of users) store.collection("users").create(user);
  const persistence = createStorePersistence(store, { file: path });
  await persistence.close();
}

describe("a store kept in an SQLite file", () => {
  it("takes the records the file holds when restored, replacing those collections' seeds", async () => {
    const path = file();
    await savedWith(path, [{ id: 1, name: "Ada" }]);
    const store = createMockStore();
    store.collection("users").create({ id: 9, name: "Seed" });
    store.collection("posts").create({ id: 1 });

    await persist(store, { file: path }).restore();

    expect(store.collection("users").getAll()).toEqual([{ id: 1, name: "Ada" }]);
    expect(store.collection("posts").getAll()).toEqual([{ id: 1 }]);
  });

  it("takes only the collections named, and drops one no longer served at the next save", async () => {
    const path = file();
    const first = createMockStore();
    first.collection("users").create({ id: 1 });
    first.collection("gone").create({ id: 1 });
    await createStorePersistence(first, { file: path }).close();
    const store = createMockStore();

    const persistence = persist(store, { file: path, collections: ["users"] });
    await persistence.restore();
    await persistence.flush();

    expect(store.list()).toEqual(["users"]);
    expect(stored(path)).toEqual({ users: [{ id: 1 }] });
  });

  it("keeps a collection emptied across a restart, rather than seeding it again", async () => {
    const path = file();
    const first = createMockStore();
    first.collection("users").create({ id: 1 });
    const persistence = createStorePersistence(first, { file: path });
    await persistence.flush();
    first.collection("users").clear();
    await persistence.close();
    const store = createMockStore();
    store.collection("users").create({ id: 9 });

    await persist(store, { file: path }).restore();

    expect(store.collection("users").getAll()).toEqual([]);
  });

  it("keeps a record a handler edited in place", async () => {
    const path = file();
    const first = createMockStore();
    const persistence = createStorePersistence(first, { file: path });
    await persistence.restore();
    first.collection("users").create({ id: 1, name: "Ada" });
    await persistence.flush();
    const [ada] = first.collection("users").getAll();
    if (ada === undefined) throw new Error("no user");

    ada.name = "Ada Lovelace";
    await persistence.close();

    expect(stored(path)).toEqual({ users: [{ id: 1, name: "Ada Lovelace" }] });
  });

  it("is saved once for changes in quick succession, and not while nothing changed", async () => {
    const path = file();
    const store = createMockStore();
    let writes = 0;
    const persistence = persist(store, { file: path }, async (target) => {
      const opened = await openStoreDatabase(target);
      if ("database" in opened) {
        const write = opened.database.write;
        opened.database.write = (changes) => {
          writes += 1;
          write(changes);
        };
      }
      return opened;
    });
    await persistence.restore();
    store.collection("users").create({ id: 1 });
    persistence.schedule();
    store.collection("users").create({ id: 2 });
    persistence.schedule();
    await new Promise((resolve) => setTimeout(resolve, 400));
    const written = statSync(path).mtimeMs;

    await persistence.flush();

    expect(writes).toBe(1);
    expect(stored(path)).toEqual({ users: [{ id: 1 }, { id: 2 }] });
    expect(statSync(path).mtimeMs).toBe(written);
  });

  it("sets a file it cannot read aside, and keeps the store's seeds", async () => {
    const path = file();
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(
      path,
      "these bytes are no SQLite database, though there are enough of them to be read as one",
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const store = createMockStore();
    store.collection("users").create({ id: 9 });

    await persist(store, { file: path }).restore();

    expect(store.collection("users").getAll()).toEqual([{ id: 9 }]);
    expect(String(warn.mock.calls[0])).toContain("starts from its seeds");
  });

  it("keeps the records only while the server runs where there is no SQLite, and says so once", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const store = createMockStore();
    const persistence = persist(store, { file: file() }, async () => ({
      refusal: "this runtime has no node:sqlite",
    }));

    await persistence.restore();
    store.collection("users").create({ id: 1 });
    await persistence.flush();

    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0])).toContain("only while the server runs");
  });

  it("reports a save that fails, and saves at the next change", async () => {
    const path = file();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    let failures = 1;
    const store = createMockStore();
    const persistence = persist(store, { file: path }, async (target) => {
      const opened = await openStoreDatabase(target);
      if ("database" in opened) {
        const write = opened.database.write;
        opened.database.write = (changes) => {
          if (failures-- > 0) throw new Error("disk full");
          write(changes);
        };
      }
      return opened;
    });
    store.collection("users").create({ id: 1 });

    await persistence.flush();
    expect(String(warn.mock.calls[0])).toContain("could not be saved");

    store.collection("users").create({ id: 2 });
    await persistence.flush();
    expect(stored(path)).toEqual({ users: [{ id: 1 }, { id: 2 }] });
  });

  it("reports a file it cannot open, and opens it at the next change once it can", async () => {
    const path = file();
    mkdirSync(path, { recursive: true });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const store = createMockStore();
    const persistence = persist(store, { file: path });
    store.collection("users").create({ id: 1 });

    await persistence.flush();
    expect(String(warn.mock.calls[0])).toContain("could not open");

    rmSync(path, { recursive: true });
    await persistence.flush();
    expect(stored(path)).toEqual({ users: [{ id: 1 }] });
  });
});
