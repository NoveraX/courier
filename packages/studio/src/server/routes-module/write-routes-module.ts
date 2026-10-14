import { dirname } from "node:path";

import { formatProjectFiles } from "../project-format/format-project-files";
import { assertRealInside } from "../project-fs/assert-real-inside";
import { ensureDirectory } from "../project-fs/ensure-directory";
import { ProjectFileMissingError } from "../project-fs/project-file-missing-error";
import type { ProjectRoot } from "../project-fs/project-root";
import { readProjectText } from "../project-fs/read-project-text";
import { resolveProjectPath } from "../project-fs/resolve-project-path";
import { writeFileAtomically } from "../project-fs/write-file-atomically";
import type { ComposedRoutesModule } from "./compose-routes-module";
import { ROUTES_MODULE_MARK } from "./routes-module-text";

/* How far into a file Studio looks for the words it opens a routes module with. */
const MARK_WITHIN = 512;

/**
 * What became of a routes module: written; already as composed; out of
 * date, for a check that writes nothing; not needed, with no endpoint a page
 * may call and no file to empty; or left alone, a file Studio did not write.
 */
export type RoutesModuleStatus = "written" | "unchanged" | "stale" | "none" | "foreign";

/** What writing, or checking, a routes module came to. */
export interface RoutesModuleOutcome {
  status: RoutesModuleStatus;
  module: ComposedRoutesModule;
  /** Why the module is as composed rather than as the project's formatters lay it out; `null` when it is not. */
  formatting: string | null;
}

/**
 * Write a routes module as the project formats its code, where it differs
 * from the file on disk, or only say whether it does. A file is written
 * whole, at once, and only over one Studio wrote: a file there that does
 * not open as a routes module is left as it is. With no endpoint a page may
 * call, a module is written only to empty one that is there.
 *
 * @param root - The project
 * @param module - The module, as composed
 * @param options - `check`: compare with the file on disk, and write nothing
 * @returns What became of it
 * @throws {PathOutsideProjectError} When the module's path, or where it leads, is outside the project
 * @throws The file system's error when the file cannot be read or written
 * @example
 * ```ts
 * const { status } = await writeRoutesModule(root, composed, { check: true }); // → "stale"
 * ```
 */
export async function writeRoutesModule(
  root: ProjectRoot,
  module: ComposedRoutesModule,
  { check = false }: { check?: boolean | undefined } = {},
): Promise<RoutesModuleOutcome> {
  const absolute = resolveProjectPath(root.path, module.path);
  assertRealInside(root, absolute);
  const onDisk = readIfThere(root, module.path);
  if (onDisk === null && module.endpoints === 0) {
    return { status: "none", module, formatting: null };
  }
  if (onDisk !== null && !onDisk.slice(0, MARK_WITHIN).includes(ROUTES_MODULE_MARK)) {
    return { status: "foreign", module, formatting: null };
  }
  const { files, problem } = await formatProjectFiles(root.path, [
    { path: module.path, content: module.content },
  ]);
  const text = files[0]?.content ?? module.content;
  const outcome = (status: RoutesModuleStatus): RoutesModuleOutcome => ({
    status,
    module: { ...module, content: text },
    formatting: problem,
  });
  if (onDisk === text) return outcome("unchanged");
  if (check) return outcome("stale");
  ensureDirectory(root, dirname(absolute));
  writeFileAtomically(absolute, text, ".courier.routes");
  return outcome("written");
}

function readIfThere(root: ProjectRoot, path: string): string | null {
  try {
    return readProjectText(root, path);
  } catch (error) {
    if (error instanceof ProjectFileMissingError) return null;
    throw error;
  }
}
