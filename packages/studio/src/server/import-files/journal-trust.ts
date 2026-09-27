import { posix } from "node:path";
import { isCanonicalPath } from "../../apis/layout";
import { COURIER_DIR } from "../courier-dir";
import { isApplyId } from "./apply-id";
import type { ApplyJournal } from "./apply-journal";
import { IMPORT_TEMP_PREFIX } from "./stage-writes";

const TEMP_NAME = new RegExp(
  `^${IMPORT_TEMP_PREFIX.replaceAll(".", "\\.")}\\.\\d+-[0-9a-f]{8}\\.tmp$`,
);

function inside(dir: string, path: string): boolean {
  return isCanonicalPath(path) && path.startsWith(`${dir}/`);
}

/* A folder an apply may have created: the import's folder, one above it on the way, or one inside it. */
function onTheWay(dir: string, created: string): boolean {
  return (
    isCanonicalPath(created) &&
    (created === dir || dir.startsWith(`${created}/`) || created.startsWith(`${dir}/`))
  );
}

/**
 * Tell why a journal found in `.courier/journal` is not one Studio wrote
 * for an apply of its own, or `null` when it is. `.courier/` can arrive
 * with a project, so a journal is acted on only when everything it names
 * is what an apply writes: its id is its file's name, its backup is
 * `.courier/backups/<id>`, its folder is one an import is written to, its
 * files lie in that folder, its temporary files are Studio's, and the
 * folders it created lead to that folder or lie in it.
 *
 * @param fileName - The journal's file name
 * @param journal - Its content
 * @returns Why it is not trusted, or `null`
 * @example
 * ```ts
 * journalProblem("1759000000000-0a1b2c3d.json", journal); // → null
 * ```
 */
export function journalProblem(fileName: string, journal: ApplyJournal): string | null {
  const { id, dir } = journal;
  if (!isApplyId(id) || fileName !== `${id}.json`) return "its id is not its file's name";
  if (journal.backupDir !== `${COURIER_DIR}/backups/${id}`)
    return "its backup folder is not its own";
  if (dir === "." || !isCanonicalPath(dir)) return "its folder is not one an import is written to";
  const stray = journal.entries.find((entry) => !inside(dir, entry.path));
  if (stray !== undefined) return `${stray.path} is not in ${dir}`;
  const temp = journal.temps.find(
    (path) => !inside(dir, path) || !TEMP_NAME.test(posix.basename(path)),
  );
  if (temp !== undefined) return `${temp} is not a temporary file of Studio's in ${dir}`;
  const created = journal.createdDirs.find((path) => !onTheWay(dir, path));
  return created === undefined ? null : `${created} is not a folder on the way to ${dir}`;
}
