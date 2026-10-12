import { createHash, randomUUID } from "node:crypto";
import { mkdir, readdir, rm, rmdir, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type * as vscode from "vscode";

import { ICONS_HOME } from "./icon-files";
import { logFailure } from "./icons-log";

/* The key of this profile's own id in its state. */
const PROFILE = "courier.fileIcons.profile";
/* A profile not started for this long — deleted, or a temporary one gone — no longer keeps the copies. */
const GONE_MS = 90 * 24 * 60 * 60 * 1000;

/** The profiles on this computer that use one folder of Courier's icon copies. */
export interface IconUsers {
  /** Whether this profile is one of them */
  has(): Promise<boolean>;
  /** Count this profile in */
  add(): Promise<void>;
  /** Count this profile out, when it was in, and say whether no profile uses the copies now */
  release(): Promise<boolean>;
}

/**
 * The profiles on this computer that use one folder of Courier's icon
 * copies — an empty file for each, under Courier's folder in the editor's
 * extensions folder. Every profile shares the extensions folder and
 * vscode-icons' custom icons folder, while each has settings of its own:
 * the copies go only once no profile that put them in uses them, never
 * because a profile that never did lacks them.
 *
 * Each profile's file is written again whenever it keeps the icons, and
 * one not written for ninety days — a profile deleted, or a temporary one
 * gone — no longer counts.
 *
 * @param extensionsDir - The editor's extensions folder, the theme's parent
 * @param copies - The folder that holds the copies
 * @param profile - What tells this profile from the others: its own id, from {@link profileOf}
 * @returns The profiles that use the copies
 * @example
 * ```ts
 * const users = iconUsers(dirname(material.extensionPath), home, profileOf(context.globalState));
 * if (await users.release()) await removeCopies(files, home);
 * ```
 */
export function iconUsers(extensionsDir: string, copies: string, profile: string): IconUsers {
  const users = join(extensionsDir, ICONS_HOME, "users");
  const folder = join(users, digest(copies));
  const mark = join(folder, digest(profile));
  return {
    has: async () => (await stat(mark).catch(() => undefined)) !== undefined,
    async add() {
      await mkdir(folder, { recursive: true });
      await writeFile(mark, "");
    },
    async release() {
      await rm(mark, { force: true });
      if ((await countIn(folder)) > 0) return false;
      await removeEmpty([folder, users, dirname(users)]);
      return true;
    },
  };
}

/**
 * What tells this profile from the editor's others: an id it keeps in its
 * own state, made the first time it is asked for. Every profile has state
 * of its own, while an extension's storage folder is one for all of them.
 *
 * @param state - The profile's state: the extension's global state
 * @returns The id
 * @example
 * ```ts
 * const icons = { dir, profile: profileOf(context.globalState) };
 * ```
 */
export function profileOf(state: vscode.Memento): string {
  const kept = state.get<string>(PROFILE);
  if (kept) return kept;
  const made = randomUUID();
  state.update(PROFILE, made).then(undefined, (error: unknown) => {
    logFailure("Courier could not keep this profile's id: it counts as a new one next time", error);
  });
  return made;
}

/* The profiles counted in a folder, those gone for good taken away. */
async function countIn(folder: string): Promise<number> {
  const marks = await readdir(folder).catch(() => []);
  let count = 0;
  for (const name of marks) {
    const mark = join(folder, name);
    const written = (await stat(mark).catch(() => undefined))?.mtimeMs ?? 0;
    if (Date.now() - written < GONE_MS) count += 1;
    else await rm(mark, { force: true });
  }
  return count;
}

/* Each folder, innermost first, while it is there and empty. */
async function removeEmpty(folders: readonly string[]): Promise<void> {
  for (const folder of folders) {
    const left = await readdir(folder).catch(() => undefined);
    if (left?.length !== 0) return;
    await rmdir(folder);
  }
}

/* A short name that tells paths apart without saying whose they are. */
function digest(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}
