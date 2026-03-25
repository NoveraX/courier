/**
 * Session persistence — save/load/delete/list sessions on disk.
 *
 * Sessions are stored as individual JSON files in `.nexus/sessions/`.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { resolveProject } from "../context";
import type { SavedSession, SessionSummary } from "./session-types";

const SESSIONS_DIR = ".nexus/sessions";

/** Resolve sessions directory path */
function sessionsDir(): string {
  return resolveProject(SESSIONS_DIR);
}

/** Ensure sessions directory exists */
function ensureDir(): void {
  const dir = sessionsDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

/** Build filename for a session */
function sessionPath(id: string): string {
  // Sanitize ID to prevent traversal
  const safe = id.replace(/[^a-zA-Z0-9_-]/g, "");
  return join(sessionsDir(), `${safe}.json`);
}

/** Save a session to disk */
export function saveSession(session: SavedSession): void {
  ensureDir();
  writeFileSync(sessionPath(session.id), JSON.stringify(session, null, 2), "utf-8");
}

/** Load a session from disk */
export function loadSession(id: string): SavedSession | null {
  const filePath = sessionPath(id);
  if (!existsSync(filePath)) return null;

  try {
    return JSON.parse(readFileSync(filePath, "utf-8")) as SavedSession;
  } catch {
    return null;
  }
}

/** Delete a session from disk */
export function deleteSession(id: string): boolean {
  const filePath = sessionPath(id);
  if (!existsSync(filePath)) return false;

  rmSync(filePath);
  return true;
}

/** List all saved sessions (summaries only, no request data) */
export function listSessions(): SessionSummary[] {
  ensureDir();
  const dir = sessionsDir();
  const files = readdirSync(dir).filter((f) => f.endsWith(".json"));

  const summaries: SessionSummary[] = [];

  for (const file of files) {
    try {
      const raw = readFileSync(join(dir, file), "utf-8");
      const session = JSON.parse(raw) as SavedSession;
      summaries.push({
        id: session.id,
        name: session.name,
        savedAt: session.savedAt,
        startedAt: session.startedAt,
        duration: session.duration,
        stats: session.stats,
        appCount: session.apps.length,
      });
    } catch {
      // Skip corrupted files
    }
  }

  return summaries.sort((a, b) => b.savedAt - a.savedAt);
}
