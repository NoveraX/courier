/**
 * The SQLite file a mock store is kept in: created with its folder and its
 * schema, brought up to date as it opens, refused when a newer Courier wrote
 * it, set aside when it holds no database, and written all or nothing.
 */
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";

import { openStoreDatabase, type StoreDatabase } from "../../src/store/store-database";

const dirs: string[] = [];
const open: StoreDatabase[] = [];

afterEach(() => {
  for (const database of open.splice(0)) database.close();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function folder(): string {
  const dir = mkdtempSync(join(tmpdir(), "courier-store-db-"));
  dirs.push(dir);
  return dir;
}

async function opened(file: string) {
  const result = await openStoreDatabase(file);
  if (!("database" in result)) throw new Error(`refused: ${result.refusal}`);
  open.push(result.database);
  return result;
}

/** The file's schema version, read through a connection of the test's own. */
function versionOf(file: string): unknown {
  const db = new DatabaseSync(file);
  try {
    return db.prepare("PRAGMA user_version").get()?.user_version;
  } finally {
    db.close();
  }
}

describe("a store file", () => {
  it("is created with its folder and the current schema", async () => {
    const file = join(folder(), ".courier", "mocks", "users.sqlite");

    const { note } = await opened(file);

    expect(note).toBeNull();
    expect(existsSync(file)).toBe(true);
    expect(versionOf(file)).toBe(1);
  });

  it("gives back every collection, an empty one included, each in its order", async () => {
    const file = join(folder(), "users.sqlite");
    const { database } = await opened(file);

    database.write({
      added: ["users", "posts"],
      removed: [],
      upserts: [
        { collection: "users", row: 2, position: 0, data: '{"id":2}' },
        { collection: "users", row: 1, position: 1, data: '{"id":1}' },
      ],
      deletes: [],
    });

    expect(database.read()).toEqual(
      new Map([
        [
          "users",
          [
            { row: 2, position: 0, data: '{"id":2}' },
            { row: 1, position: 1, data: '{"id":1}' },
          ],
        ],
        ["posts", []],
      ]),
    );
  });

  it("brings a file of an earlier schema up to date as it opens", async () => {
    const file = join(folder(), "users.sqlite");
    new DatabaseSync(file).close();
    expect(versionOf(file)).toBe(0);

    const { database } = await opened(file);

    expect(versionOf(file)).toBe(1);
    expect(database.read()).toEqual(new Map());
  });

  it("is refused, and left as it is, when a newer Courier wrote it", async () => {
    const file = join(folder(), "users.sqlite");
    const db = new DatabaseSync(file);
    db.exec("PRAGMA user_version = 99");
    db.close();
    const before = readFileSync(file);

    const result = await openStoreDatabase(file);

    expect(result).toEqual({ refusal: expect.stringContaining("newer Courier (schema 99") });
    expect(readFileSync(file)).toEqual(before);
  });

  it("is set aside, and a new one started, when it holds no database", async () => {
    const dir = folder();
    const file = join(dir, "users.sqlite");
    writeFileSync(
      file,
      "these bytes are no SQLite database, though there are enough of them to be read as one",
    );

    const { database, note } = await opened(file);

    expect(note).toMatch(/could not be read, and was kept as .*users\.sqlite\.unreadable-/);
    expect(readdirSync(dir).filter((name) => name.includes(".unreadable-"))).toHaveLength(1);
    expect(database.read()).toEqual(new Map());
  });

  it("writes all of a save or, when a part fails, none of it", async () => {
    const file = join(folder(), "users.sqlite");
    const { database } = await opened(file);

    expect(() =>
      database.write({
        added: ["users"],
        removed: [],
        upserts: [
          { collection: "users", row: 1, position: 0, data: '{"id":1}' },
          { collection: "never-added", row: 1, position: 0, data: '{"id":1}' },
        ],
        deletes: [],
      }),
    ).toThrow();

    expect(database.read()).toEqual(new Map());
  });

  it("drops a collection's records with the collection", async () => {
    const file = join(folder(), "users.sqlite");
    const { database } = await opened(file);
    database.write({
      added: ["users"],
      removed: [],
      upserts: [{ collection: "users", row: 1, position: 0, data: '{"id":1}' }],
      deletes: [],
    });

    database.write({ added: [], removed: ["users"], upserts: [], deletes: [] });

    expect(database.read()).toEqual(new Map());
  });
});

describe("a store file's size", () => {
  it("goes back down once its records are deleted", async () => {
    const file = join(folder(), "shop.sqlite");
    const { database } = await opened(file);
    const data = JSON.stringify({ note: "n".repeat(4096) });
    const upserts = Array.from({ length: 2000 }, (_, row) => ({
      collection: "orders",
      row: row + 1,
      position: row,
      data,
    }));
    database.write({ added: ["orders"], removed: [], upserts, deletes: [] });
    const full = statSync(file).size;

    database.write({ added: [], removed: ["orders"], upserts: [], deletes: [] });

    expect(full).toBeGreaterThan(8 * 1024 * 1024);
    expect(statSync(file).size).toBeLessThan(full / 4);
  });

  it("is compacted, once, when a store made before opens", async () => {
    const file = join(folder(), "old.sqlite");
    const old = new DatabaseSync(file);
    old.exec("CREATE TABLE filler (body TEXT)");
    const insert = old.prepare("INSERT INTO filler (body) VALUES (?)");
    for (let i = 0; i < 200; i++) insert.run("z".repeat(64 * 1024));
    old.exec("DELETE FROM filler");
    old.close();
    const before = statSync(file).size;

    await opened(file);

    expect(statSync(file).size).toBeLessThan(before / 4);
  });
});
