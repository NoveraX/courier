/**
 * Studio's database gives the room its deleted rows took back to the disk:
 * one made before is compacted once as it opens, and freed room goes back
 * as the logs let their oldest requests go.
 */
import { mkdirSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { openStudioDb } from "../../src/server/storage/studio-db";
import { trimFreedRoom } from "../../src/server/storage-space/compact-db";

const cleanups: Array<() => void> = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
});

function project(): string {
  const root = mkdtempSync(join(tmpdir(), "courier-compact-"));
  cleanups.push(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

describe("a database that gives back the room its deleted rows took", () => {
  it("compacts one made before, once, and gives back freed room as it goes", () => {
    const root = project();
    mkdirSync(join(root, ".courier"));
    const file = join(root, ".courier", "studio.db");
    const old = new DatabaseSync(file);
    old.exec("CREATE TABLE filler (body TEXT)");
    const insert = old.prepare("INSERT INTO filler (body) VALUES (?)");
    for (let i = 0; i < 400; i++) insert.run("z".repeat(64 * 1024));
    old.exec("DELETE FROM filler");
    old.close();
    const before = statSync(file).size;

    const studio = openStudioDb(root);
    cleanups.push(() => studio.close());

    expect(before).toBeGreaterThan(20 * 1024 * 1024);
    expect(statSync(file).size).toBeLessThan(1024 * 1024);
    expect(studio.db.prepare("PRAGMA auto_vacuum").get()?.auto_vacuum).toBe(2);
  });

  it("gives freed room back once there is enough of it", () => {
    const root = project();
    const studio = openStudioDb(root);
    cleanups.push(() => studio.close());
    studio.db.exec("CREATE TABLE filler (body TEXT)");
    const insert = studio.db.prepare("INSERT INTO filler (body) VALUES (?)");
    for (let i = 0; i < 400; i++) insert.run("z".repeat(64 * 1024));
    studio.db.exec("DELETE FROM filler");
    const free = () => Number(studio.db.prepare("PRAGMA freelist_count").get()?.freelist_count);
    expect(free()).toBeGreaterThan(1000);

    trimFreedRoom(studio.db);

    expect(free()).toBe(0);
  });
});
