import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import type { PlannedEdit, PlannedFile } from "../plan/build-plan";

/**
 * Write the plan's new files. Each is created only where nothing is: a
 * file that appeared since the plan was made is not replaced, and the write
 * stops with its name.
 *
 * @param root - The project's folder
 * @param files - The plan's files; only those to create are written
 * @returns The paths written, relative to the root
 * @throws {Error} When a file to create is there by now
 * @example
 * ```ts
 * writePlannedFiles(project.root, plan.files);
 * ```
 */
export function writePlannedFiles(root: string, files: readonly PlannedFile[]): string[] {
  const written: string[] = [];
  for (const file of files.filter((planned) => planned.state === "create")) {
    const path = join(root, file.path);
    mkdirSync(dirname(path), { recursive: true });
    try {
      writeFileSync(path, file.content, { flag: "wx" });
    } catch (error) {
      const code = error instanceof Error && "code" in error ? error.code : undefined;
      if (code === "EEXIST")
        throw new Error(`${file.path} was created while the plan was shown; nothing was replaced`);
      throw error;
    }
    written.push(file.path);
  }
  return written;
}

/**
 * Make sure each file the plan changes is as it was when the plan was
 * shown, before anything is written: a file changed since keeps its
 * changes, and the setup stops with its name.
 *
 * @param root - The project's folder
 * @param edits - The plan's edits
 * @throws {Error} When a file changed or went away since the plan was made
 * @example
 * ```ts
 * checkEditsCurrent(project.root, plan.edits);
 * ```
 */
export function checkEditsCurrent(root: string, edits: readonly PlannedEdit[]): void {
  for (const edit of edits.filter((planned) => planned.state === "edit")) {
    const path = join(root, edit.path);
    const now = existsSync(path) ? readFileSync(path, "utf8") : undefined;
    if (now !== edit.before)
      throw new Error(`${edit.path} changed while the plan was shown; nothing was written`);
  }
}

/**
 * Make the plan's changes to files of the project's.
 *
 * @param root - The project's folder
 * @param edits - The plan's edits; only those that change a file are written
 * @returns The files changed, relative to the root
 * @example
 * ```ts
 * writePlannedEdits(project.root, plan.edits); // ["vite.config.ts"]
 * ```
 */
export function writePlannedEdits(root: string, edits: readonly PlannedEdit[]): string[] {
  const changed = edits.filter((edit) => edit.state === "edit");
  for (const edit of changed) writeFileSync(join(root, edit.path), edit.after);
  return changed.map((edit) => edit.path);
}
