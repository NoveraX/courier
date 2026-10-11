import { stat } from "node:fs/promises";
import { join } from "node:path";
import * as vscode from "vscode";

import { ICON_THEMES } from "./icon-files";
import { writeUserSetting } from "./user-settings";
import { VSICONS_APPLY } from "./vscode-icons";

/* How long vscode-icons gets to start rewriting its theme after a change, and how long it must then stay still. */
const REACTION_MS = 3_000;
const STILL_MS = 300;
const POLL_MS = 100;

/**
 * Change vscode-icons' settings one at a time, each once vscode-icons has
 * rewritten its theme for the one before: it rewrites the theme's files on
 * every change to its associations without waiting for a rewrite already
 * under way, and two rewrites at once leave a file it cannot read the next
 * time it starts. When it rewrote nothing — it is not running, or told not
 * to react — its own command applies the settings, once.
 *
 * @param changes - Each setting's full key and its new value
 * @example
 * ```ts
 * await changeVsicons([[VSICONS_FILES, files], [VSICONS_FOLDERS, folders]]);
 * ```
 */
export async function changeVsicons(
  changes: readonly (readonly [string, unknown])[],
): Promise<void> {
  const files = themeFiles();
  let rewritten = false;
  for (const [key, value] of changes) {
    const before = await timesOf(files);
    if (!(await writeUserSetting(key, value))) continue;
    rewritten = (await rewriteOf(files, before)) || rewritten;
  }
  if (!rewritten) await askVsiconsToApply();
}

/**
 * Ask vscode-icons to apply its settings again, while it runs.
 *
 * @example
 * ```ts
 * await askVsiconsToApply();
 * ```
 */
export async function askVsiconsToApply(): Promise<void> {
  if ((await vscode.commands.getCommands(true)).includes(VSICONS_APPLY)) {
    await vscode.commands.executeCommand(VSICONS_APPLY);
  }
}

/* The files vscode-icons writes its theme to, the last one written last. */
function themeFiles(): string[] {
  const vsicons = vscode.extensions.getExtension(ICON_THEMES.vsicons.extension);
  if (!vsicons) return [];
  const folder = join(vsicons.extensionPath, "dist", "src");
  return [join(folder, "vsicons-icon-theme.json"), join(folder, "vsicons-icon-theme-zed.json")];
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
