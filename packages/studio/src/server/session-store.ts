/**
 * Session persistence — save/load/delete/list sessions on disk.
 *
 * Sessions are stored as individual JSON files in `.courier/sessions/`. The
 * folder, like every folder Studio keeps in `.courier`, must be a real one:
 * a link could arrive with the project, and would have Studio list, read,
 * write and delete JSON files wherever it points. A session file that is a
 * link is not read either.
 */

import { lstatSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createLogger } from "@noverax/courier";
import { getProjectRoot } from "../context";
import { COURIER_DIR, ensureCourierSubdir, hasCourierSubdir } from "./courier-dir";
import { errnoCode } from "./errno-code";
import { NotRegularFileError } from "./not-regular-file-error";
import { readRegularFile } from "./read-regular-file";
import { readSavedSession } from "./session-guard";
import type { SavedSession, SessionSummary } from "./session-types";

const log = createLogger("Studio");

const SESSIONS = "sessions";

/* The sessions folder, or `null` while there is none. */
function existingDir(): string | null {
  const root = getProjectRoot();
  return hasCourierSubdir(root, SESSIONS) ? join(root, COURIER_DIR, SESSIONS) : null;
}

/**
 * Save a session to disk, as a new file named after its id.
 *
 * @param session - The session
 * @throws {CourierDirUnsafeError} When `.courier` or its `sessions` folder is a link or not a folder
 * @example
 * ```ts
 * saveSession(buildSession({ name: "login flow", requests, apps: [] }));
 * ```
 */
export function saveSession(session: SavedSession): void {
  const dir = ensureCourierSubdir(getProjectRoot(), SESSIONS);
  /* `wx` creates the file or fails: nothing already there, a link least of all, is written through. */
  writeFileSync(join(dir, `${session.id}.json`), JSON.stringify(session, null, 2), {
    encoding: "utf-8",
    flag: "wx",
  });
}

/**
 * Load a saved session.
 *
 * @param id - The session's id, as {@link isSessionId} accepts it
 * @returns The session, or `null` when there is none by that id that Studio can read
 * @throws {CourierDirUnsafeError} When `.courier` or its `sessions` folder is a link or not a folder
 */
export function loadSession(id: string): SavedSession | null {
  const dir = existingDir();
  return dir === null ? null : readSession(join(dir, `${id}.json`));
}

/**
 * Delete a saved session.
 *
 * @param id - The session's id, as {@link isSessionId} accepts it
 * @returns `true` when a session file was deleted; `false` when there was none
 * @throws {CourierDirUnsafeError} When `.courier` or its `sessions` folder is a link or not a folder
 */
export function deleteSession(id: string): boolean {
  const dir = existingDir();
  if (dir === null) return false;
  const path = join(dir, `${id}.json`);
  try {
    if (!lstatSync(path).isFile()) return false;
  } catch (error) {
    if (errnoCode(error) === "ENOENT") return false;
    throw error;
  }
  rmSync(path);
  return true;
}

/**
 * List every saved session, newest first, without their requests.
 *
 * @returns The summaries; none while there is no sessions folder
 * @throws {CourierDirUnsafeError} When `.courier` or its `sessions` folder is a link or not a folder
 */
export function listSessions(): SessionSummary[] {
  const dir = existingDir();
  if (dir === null) return [];
  const summaries: SessionSummary[] = [];
  for (const file of readdirSync(dir).filter((name) => name.endsWith(".json"))) {
    const session = readSession(join(dir, file));
    if (session === null) continue;
    const { id, name, savedAt, startedAt, duration, stats, apps } = session;
    summaries.push({ id, name, savedAt, startedAt, duration, stats, appCount: apps.length });
  }
  return summaries.sort((a, b) => b.savedAt - a.savedAt);
}

/* A session file, or `null` for none, a link, or one that is not a session. */
function readSession(path: string): SavedSession | null {
  let file: ReturnType<typeof readRegularFile>;
  try {
    file = readRegularFile(path);
  } catch (error) {
    if (!(error instanceof NotRegularFileError)) throw error;
    log.warn(`${error.message} Studio leaves it out of the saved sessions.`);
    return null;
  }
  if (file === null) return null;
  const session = readSavedSession(file.bytes.toString("utf-8"));
  if (session === null) log.warn(`${path} is not a session Studio saved; it is left out`);
  return session;
}
