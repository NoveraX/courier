import { existsSync, readFileSync } from "node:fs";

import { isRecord } from "../is-record";
import type { Plan, PlannedEdit } from "../plan/build-plan";
import type { FileJournal } from "./file-journal";
import { projectPath } from "./file-ops";
import { SetupFailure } from "./setup-failure";

/* The file an install writes, beside the lockfile: its fields of packages change under the plan, and only they may. */
const INSTALLED_MANIFEST = "package.json";
const INSTALLED_FIELDS: ReadonlySet<string> = new Set([
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
  "packageManager",
]);

function textAt(root: string, path: string): string | undefined {
  const real = projectPath(root, path);
  return existsSync(real) ? readFileSync(real, "utf8") : undefined;
}

/* A JSON value written with its keys in order, so two that differ only in the order of their keys read the same. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonical(value[key])]),
  );
}

/* package.json as it reads apart from what an install writes into it; `undefined` for text that is no JSON object. */
function apartFromInstalled(text: string): string | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    /* Text that is no JSON is no package.json an install wrote: the write stops as for a file changed. */
    return undefined;
  }
  if (!isRecord(parsed)) return undefined;
  const kept = Object.entries(parsed).filter(([key]) => !INSTALLED_FIELDS.has(key));
  return JSON.stringify(canonical(Object.fromEntries(kept)));
}

/**
 * Make sure each file the plan changes is as it was when the plan was
 * shown, before anything is installed or written: a file changed since
 * keeps its changes, and the setup stops with its name.
 *
 * @param root - The project's folder
 * @param edits - The plan's edits
 * @throws {SetupFailure} `FILE_CHANGED` when a file changed or went away since the plan was made
 * @example
 * ```ts
 * checkEditsCurrent(project.root, plan.edits);
 * ```
 */
export function checkEditsCurrent(root: string, edits: readonly PlannedEdit[]): void {
  for (const edit of edits.filter((planned) => planned.state === "edit")) {
    if (textAt(root, edit.path) !== edit.before)
      throw new SetupFailure("FILE_CHANGED", `${edit.path} changed while the plan was shown`);
  }
}

/* An edit as it is written now: against its file as it was planned on, or package.json as the install left it. */
function editNow(root: string, edit: PlannedEdit): { before: string; after: string } {
  const now = textAt(root, edit.path);
  if (now === edit.before) return { before: edit.before, after: edit.after };
  const installed =
    edit.path === INSTALLED_MANIFEST &&
    now !== undefined &&
    apartFromInstalled(now) !== undefined &&
    apartFromInstalled(now) === apartFromInstalled(edit.before);
  const after = installed ? edit.change(now) : undefined;
  if (now === undefined || after === undefined)
    throw new SetupFailure("FILE_CHANGED", `${edit.path} changed while the plan was shown`);
  return { before: now, after };
}

/**
 * Write the plan's new files and its changes to files of the project's,
 * each noted in the journal so it can be undone. A file to add that is
 * there by now is not replaced, and a file to change that someone else
 * changed meanwhile keeps their changes: the write stops with its name.
 * package.json, which the install wrote first, gets the plan's changes
 * made again to it, where the install changed nothing in it but its
 * packages.
 *
 * @param journal - Where each write is noted
 * @param root - The project's folder
 * @param plan - The plan
 * @throws {SetupFailure} When a file appeared or changed, leads out of the project, or cannot be written
 * @example
 * ```ts
 * writePlan(journal, project.root, plan);
 * ```
 */
export function writePlan(journal: FileJournal, root: string, plan: Plan): void {
  for (const file of plan.files.filter((planned) => planned.state === "create"))
    journal.create(file.path, file.content);
  for (const edit of plan.edits.filter((planned) => planned.state === "edit")) {
    const { before, after } = editNow(root, edit);
    journal.replace(edit.path, before, after);
  }
}
