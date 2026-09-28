/**
 * Studio's own database, `.courier/studio.db`, where what Studio shows is
 * kept — so a page that reloads, and a Studio that restarts, finds it again.
 * SQLite, built into Node: nothing to install or set up.
 */

import { lstatSync, renameSync } from "node:fs";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";

import { createLogger } from "@noverax/courier";

import { ensureCourierDir } from "../courier-dir";
import { errnoCode } from "../errno-code";
import { messageOf } from "../message-of";
import { migrate } from "./migrate";

const log = createLogger("Studio");

/** The database's file, in `.courier` */
export const DATABASE_FILE = "studio.db";

/** Studio's database, open */
export interface StudioDb {
  readonly db: DatabaseSync;
  /** On disk; one Studio could not open there is kept in memory, and goes with it */
  readonly persistent: boolean;
  close(): void;
}

/**
 * Open the project's Studio database, creating it the first time.
 *
 * A database that cannot be kept — `.courier` is a link, the disk is
 * read-only, a newer Studio made it — is kept in memory for the run instead,
 * with a warning: Studio works, and forgets on exit, as it always did. A
 * file that is not a database is moved aside and a new one started.
 *
 * @param projectRoot - The project Studio serves
 * @returns The database
 * @example
 * ```ts
 * const { db, close } = openStudioDb(projectRoot);
 * ```
 */
export function openStudioDb(projectRoot: string): StudioDb {
  const onDisk = openOnDisk(projectRoot);
  const db = onDisk ?? inMemory();
  let closed = false;
  const close = (): void => {
    if (closed) return;
    closed = true;
    closeQuietly(db);
  };
  return { db, persistent: onDisk !== undefined, close };
}

function openOnDisk(projectRoot: string): DatabaseSync | undefined {
  try {
    const path = join(ensureCourierDir(projectRoot), DATABASE_FILE);
    refuseLink(path);
    try {
      return prepared(path);
    } catch (error) {
      if (!isNotADatabase(error)) throw error;
      const aside = `${path}.broken-${Date.now()}`;
      renameSync(path, aside);
      log.warn(`${DATABASE_FILE} was not a database: moved it to ${aside} and started a new one`);
      return prepared(path);
    }
  } catch (error) {
    log.warn(`Studio keeps its data in memory for this run: ${messageOf(error)}`);
    return undefined;
  }
}

function prepared(path: string): DatabaseSync {
  const db = new (process.getBuiltinModule("node:sqlite").DatabaseSync)(path);
  try {
    db.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 2000;");
    migrate(db);
    return db;
  } catch (error) {
    closeQuietly(db);
    throw error;
  }
}

function inMemory(): DatabaseSync {
  const db = new (process.getBuiltinModule("node:sqlite").DatabaseSync)(":memory:");
  migrate(db);
  return db;
}

/* A link could arrive with the project and send every write elsewhere. */
function refuseLink(path: string): void {
  try {
    if (!lstatSync(path).isFile()) throw new Error(`${DATABASE_FILE} is not a regular file`);
  } catch (error) {
    if (errnoCode(error) !== "ENOENT") throw error;
  }
}

function isNotADatabase(error: unknown): boolean {
  return /not a database|file is encrypted/i.test(messageOf(error));
}

function closeQuietly(db: DatabaseSync): void {
  try {
    db.close();
  } catch (error) {
    log.warn(`Studio's database did not close cleanly: ${messageOf(error)}`);
  }
}
