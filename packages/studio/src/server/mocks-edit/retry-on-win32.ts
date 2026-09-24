import { createLogger } from "@noverax/courier";
import { errnoCode } from "../errno-code";

const log = createLogger("Studio");

/** The wait before each retry, doubling: about 1.5 s before giving up. */
const RETRY_DELAYS_MS: ReadonlyArray<number> = [50, 100, 200, 400, 800];

/* On Windows a file another process holds open for a moment — an editor
   saving, an indexer, an antivirus scan — cannot be renamed over or removed
   until it lets go, and these are the codes that moment produces. */
const TRANSIENT_CODES: ReadonlySet<string> = new Set(["EPERM", "EACCES", "EBUSY"]);

let sleepCell: Int32Array | undefined;

/**
 * Run a synchronous file operation, retrying it on Windows while another
 * process briefly holds the file. Elsewhere, and for any other error, the
 * first failure is thrown as it is.
 *
 * The wait between attempts blocks: the mocks file is written in one tick,
 * so that Studio can tell its own write from the user's before the file
 * watcher reports either.
 *
 * @param operation - The operation, such as a `renameSync`
 * @param description - What it does, for the debug log of a retry
 * @returns What the operation returned
 * @throws The operation's error once retries are exhausted or it is not transient
 * @example
 * ```ts
 * retryOnWin32(() => renameSync(tmp, path), `Renaming ${tmp} to ${path}`);
 * ```
 */
export function retryOnWin32<TResult>(operation: () => TResult, description: string): TResult {
  for (const delay of RETRY_DELAYS_MS) {
    try {
      return operation();
    } catch (error) {
      if (!isTransientOnWin32(error)) throw error;
      log.debug(`${description} failed with ${errnoCode(error)}; retrying in ${delay} ms`, error);
      sleepSync(delay);
    }
  }
  return operation();
}

function isTransientOnWin32(error: unknown): boolean {
  const code = errnoCode(error);
  return process.platform === "win32" && code !== undefined && TRANSIENT_CODES.has(code);
}

function sleepSync(ms: number): void {
  sleepCell ??= new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(sleepCell, 0, 0, ms);
}
