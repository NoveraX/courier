import { isRecord } from "../mocks-edit/is-record";

const HEX_64 = /^[0-9a-f]{64}$/;
const SAFE_PATH = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[^\0\\:]+$/;

/** What Studio recorded about one file it wrote for an import. */
export interface RecordedFile {
  /** The SHA-256 of the body Studio wrote, line endings as `\n`. */
  sha256: string;
  /**
   * The body kept edits the user had made to endpoints: the file is not
   * only what Studio generated, so removing it needs the user's say.
   */
  carriesEdits?: boolean;
  /** The fingerprint of each endpoint as generated, by endpoint name. */
  endpoints?: Record<string, string>;
}

/**
 * Tell whether a value read from the imports state is a map of recorded
 * files: project-relative `/` paths that stay in the project, each with a
 * hex SHA-256 and, when present, a flag and string fingerprints.
 *
 * @param value - Anything read from the state file
 * @returns `true` when every entry has that shape
 * @example
 * ```ts
 * if (!isRecordedFiles(entry.files)) return false;
 * ```
 */
export function isRecordedFiles(value: unknown): value is Record<string, RecordedFile> {
  if (!isRecord(value)) return false;
  return Object.entries(value).every(
    ([path, file]) => SAFE_PATH.test(path) && isRecordedFile(file),
  );
}

function isRecordedFile(value: unknown): value is RecordedFile {
  if (!isRecord(value)) return false;
  if (typeof value.sha256 !== "string" || !HEX_64.test(value.sha256)) return false;
  if (value.carriesEdits !== undefined && typeof value.carriesEdits !== "boolean") return false;
  if (value.endpoints === undefined) return true;
  return (
    isRecord(value.endpoints) &&
    Object.values(value.endpoints).every((hash) => typeof hash === "string")
  );
}
