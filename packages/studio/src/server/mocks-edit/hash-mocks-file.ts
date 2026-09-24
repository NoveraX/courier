import { hashFile } from "../file-hash";
import { NotRegularFileError } from "../not-regular-file-error";
import { MocksFileChangedError } from "./mocks-file-changed-error";

/**
 * The sha256 digest of the mocks file as an edit sees it. A file that became
 * a link, a directory, a FIFO or anything else since it was read has changed
 * as surely as one saved with other bytes, so that is reported as a change
 * rather than read through.
 *
 * @param path - The mocks file
 * @returns The digest, or `null` when there is nothing at the path
 * @throws {MocksFileChangedError} When the path is a symbolic link or not a regular file
 * @throws The file system's error for anything else, such as `EACCES`
 */
export function hashMocksFile(path: string): string | null {
  try {
    return hashFile(path);
  } catch (error) {
    if (error instanceof NotRegularFileError)
      throw new MocksFileChangedError(path, { cause: error });
    throw error;
  }
}
