import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";

import { MIGRATIONS, migrateStore } from "../../src/store/store-schema";

describe("migrateStore", () => {
  it("takes a new file to the current schema, one step at a time", () => {
    const db = new DatabaseSync(":memory:");

    expect(migrateStore(db)).toBeNull();

    expect(db.prepare("PRAGMA user_version").get()?.user_version).toBe(MIGRATIONS.length);
    db.close();
  });

  it("leaves a current file as it is", () => {
    const db = new DatabaseSync(":memory:");
    migrateStore(db);

    expect(migrateStore(db)).toBeNull();
    expect(db.prepare("SELECT count(*) AS n FROM collections").get()?.n).toBe(0);
    db.close();
  });

  it("refuses a file a newer Courier wrote, and changes nothing in it", () => {
    const db = new DatabaseSync(":memory:");
    db.exec(`PRAGMA user_version = ${MIGRATIONS.length + 1}`);

    expect(migrateStore(db)).toContain("newer Courier");
    expect(db.prepare("SELECT count(*) AS n FROM sqlite_schema").get()?.n).toBe(0);
    db.close();
  });

  it("leaves the file as it was when a step fails", () => {
    const db = new DatabaseSync(":memory:");
    db.exec("CREATE TABLE collections (taken INTEGER)");

    expect(() => migrateStore(db)).toThrow();

    expect(db.prepare("PRAGMA user_version").get()?.user_version).toBe(0);
    expect(
      db.prepare("SELECT count(*) AS n FROM sqlite_schema WHERE name = 'records'").get()?.n,
    ).toBe(0);
    db.close();
  });
});
