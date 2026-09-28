/**
 * Studio's database opens where it is kept, `.courier/studio.db`, and when
 * it cannot be kept there Studio still runs, with its data in memory.
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { DATABASE_FILE, openStudioDb } from "../../src/server/storage/studio-db";

const cleanups: Array<() => void> = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
});

function project(): string {
  const dir = mkdtempSync(join(tmpdir(), "courier-studio-db-"));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function opened(root: string) {
  const studio = openStudioDb(root);
  cleanups.push(() => studio.close());
  return studio;
}

describe("Studio's database", () => {
  it("is created in .courier the first time, which keeps itself out of version control", () => {
    const root = project();

    const studio = opened(root);

    expect(studio.persistent).toBe(true);
    expect(existsSync(join(root, ".courier", DATABASE_FILE))).toBe(true);
    expect(existsSync(join(root, ".courier", ".gitignore"))).toBe(true);
  });

  it.skipIf(process.platform === "win32")("is readable by its owner alone, as are the files beside it", () => {
    const root = project();
    const studio = opened(root);
    studio.db.exec("CREATE TABLE probe (n INTEGER); INSERT INTO probe VALUES (1);");

    const modes = readdirSync(join(root, ".courier"))
      .filter((name) => name.startsWith(DATABASE_FILE))
      .map((name) => [name, statSync(join(root, ".courier", name)).mode & 0o777]);

    expect(modes.length).toBeGreaterThan(0);
    expect(modes.filter(([, mode]) => mode !== 0o600)).toEqual([]);
  });

  it("keeps its data in memory when .courier is a link", () => {
    const root = project();
    const elsewhere = project();
    symlinkSync(elsewhere, join(root, ".courier"));

    const studio = opened(root);

    expect(studio.persistent).toBe(false);
    expect(readdirSync(elsewhere)).toEqual([]);
  });

  it("moves a file that is not a database aside, and starts a new one", () => {
    const root = project();
    mkdirSync(join(root, ".courier"));
    writeFileSync(join(root, ".courier", DATABASE_FILE), "not a database at all, just text ".repeat(20));

    const studio = opened(root);

    expect(studio.persistent).toBe(true);
    expect(readdirSync(join(root, ".courier")).some((name) => name.startsWith(`${DATABASE_FILE}.broken-`))).toBe(true);
  });

  it("keeps its data in memory for a database a newer Studio made", () => {
    const root = project();
    const first = openStudioDb(root);
    first.db.exec("PRAGMA user_version = 99");
    first.close();

    const studio = opened(root);

    expect(studio.persistent).toBe(false);
  });
});
