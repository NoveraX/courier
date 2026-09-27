import { statSync } from "node:fs";
import { dirname, relative, sep } from "node:path";
import { errnoCode } from "../errno-code";
import { assertRealInside } from "../project-fs/assert-real-inside";
import { ensureDirectory } from "../project-fs/ensure-directory";
import type { ProjectRoot } from "../project-fs/project-root";
import { resolveProjectPath } from "../project-fs/resolve-project-path";
import { writeTempBeside } from "../project-fs/write-temp-beside";
import type { ApplyJournal } from "./apply-journal";
import { bodyHash } from "./body-hash";
import type { FilePlan, PlannedWrite } from "./file-plan-types";
import { signGeneratedFile } from "./generated-header";

/** The start of the name of a temporary file an import's apply writes beside its target. */
export const IMPORT_TEMP_PREFIX = ".courier.import";

/** A write whose content waits, flushed, in a temporary file beside its target. */
export interface StagedWrite {
  write: PlannedWrite;
  absolute: string;
  temp: string;
  /** Whether the target existed when staged. */
  existed: boolean;
  /** SHA-256 of the body staged. */
  sha256: string;
}

/**
 * Put every file a plan writes in a temporary file beside its target, with
 * Studio's header, before anything in the project changes. Directories are
 * created one at a time and recorded in the journal, as is each temporary
 * file, so a failure or a crash can undo them. A file that is replaced
 * keeps its permission bits.
 *
 * @param root - The project
 * @param plan - The plan, confirmations applied
 * @param journal - The apply's journal, which this fills in
 * @returns The staged writes, in the plan's order
 * @throws {PathOutsideProjectError} When a target turned into a link or leads outside the project
 * @throws The file system's error when a file or directory cannot be written
 */
export function stageWrites(
  root: ProjectRoot,
  plan: FilePlan,
  journal: ApplyJournal,
): StagedWrite[] {
  const staged: StagedWrite[] = [];
  for (const write of plan.writes) {
    if (write.action === "unchanged") continue;
    const absolute = resolveProjectPath(root.path, write.path);
    assertRealInside(root, absolute);
    for (const created of ensureDirectory(root, dirname(absolute))) {
      journal.createdDirs.push(projectRelative(root, created));
    }
    const mode = modeOf(absolute);
    const temp = writeTempBeside(
      absolute,
      signGeneratedFile(plan.importName, write.body),
      mode,
      IMPORT_TEMP_PREFIX,
    );
    journal.temps.push(projectRelative(root, temp));
    staged.push({ write, absolute, temp, existed: mode !== null, sha256: bodyHash(write.body) });
  }
  return staged;
}

function modeOf(path: string): number | null {
  try {
    return statSync(path).mode & 0o7777;
  } catch (error) {
    if (errnoCode(error) === "ENOENT") return null;
    throw error;
  }
}

/* Journals name paths as the plan does, `/`-separated on every system. */
function projectRelative(root: ProjectRoot, path: string): string {
  return relative(root.path, path).split(sep).join("/");
}
