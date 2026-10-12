import { stat } from "node:fs/promises";

import { writeUserSetting } from "./user-settings";

/* How long a theme gets to start rewriting itself after a change, and how long it must then stay still. */
const REACTION_MS = 3_000;
const STILL_MS = 300;
const POLL_MS = 100;

/** An icon theme that rebuilds itself from its settings. */
export interface RebuiltTheme {
  /** The files it writes its theme to, the last one written last */
  readonly files: readonly string[];
  /** Ask it to read its settings again, when it did not on its own */
  apply?(): Promise<void>;
}

/**
 * Change an icon theme's settings one at a time, each once the theme has
 * rewritten itself for the one before. Material Icon Theme and vscode-icons
 * both rebuild their theme on every change to their settings without
 * waiting for a rebuild already under way: two at once leave the theme
 * built from settings half changed — or, for vscode-icons, a file it cannot
 * read the next time it starts. A setting that already holds its value is
 * left alone. When something changed — a setting, or the icons it reads —
 * and the theme rewrote nothing — it is not running, or told not to react
 * — it is asked to apply its settings, once; when nothing changed, it is
 * left alone too.
 *
 * @param theme - The theme's files, and how to ask it to apply its settings
 * @param changes - Each setting's full key and its new value
 * @param iconsChanged - Whether the icon files the theme reads changed, which it would not notice by itself
 * @example
 * ```ts
 * await changeThemeSettings(vsiconsTheme(), [[VSICONS_FILES, files], [VSICONS_FOLDERS, folders]]);
 * ```
 */
export async function changeThemeSettings(
  theme: RebuiltTheme,
  changes: readonly (readonly [string, unknown])[],
  iconsChanged = false,
): Promise<void> {
  let written = false;
  let rewritten = false;
  for (const [key, value] of changes) {
    const before = await timesOf(theme.files);
    if (!(await writeUserSetting(key, value))) continue;
    written = true;
    rewritten = (await rewriteOf(theme.files, before)) || rewritten;
  }
  if (!rewritten && (written || iconsChanged)) await theme.apply?.();
}

async function timesOf(files: readonly string[]): Promise<number[]> {
  return Promise.all(
    files.map(async (file) => (await stat(file).catch(() => undefined))?.mtimeMs ?? -1),
  );
}

/* Whether every theme file that was there was written after `before`: once they were, when they have stayed still. */
async function rewriteOf(files: readonly string[], before: readonly number[]): Promise<boolean> {
  if (!before.some((time) => time >= 0)) return false;
  let last = before;
  let stillSince = 0;
  let deadline = Date.now() + REACTION_MS;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    const now = await timesOf(files);
    const written = now.every(
      (time, index) => (before[index] ?? -1) < 0 || time > (before[index] ?? 0),
    );
    if (!written) continue;
    if (stillSince === 0) deadline += REACTION_MS;
    if (now.some((time, index) => time !== last[index]) || stillSince === 0) {
      last = now;
      stillSince = Date.now();
    } else if (Date.now() - stillSince >= STILL_MS) return true;
  }
  return stillSince > 0;
}
