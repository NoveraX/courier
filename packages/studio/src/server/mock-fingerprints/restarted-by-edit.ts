import { createLogger } from "@noverax/courier";
import { fingerprintMocks } from "./fingerprint-mocks";

const log = createLogger("Studio");

/** A mocks file before and after an edit, and the mocks that run from it. */
export interface MocksEdit {
  /** The mocks file, which its imports resolve from */
  file: string;
  before: string;
  after: string;
  /** The keys of the mocks running now */
  running: readonly string[];
}

/**
 * The running mocks an edit of their file restarts: each whose declaration,
 * or something it uses, the edit changes. When Studio cannot tell the file's
 * declarations apart, before or after, every running mock restarts.
 *
 * @param edit - The file's text before and after, and the mocks running
 * @returns The keys of the mocks that restart, in the order given
 * @example
 * ```ts
 * restartedByEdit({ file, before: text, after: plan.text, running: ["users", "orders"] });
 * // → [] when the edit only adds a mock
 * ```
 */
export function restartedByEdit({ file, before, after, running }: MocksEdit): string[] {
  try {
    const was = fingerprintMocks(file, before);
    const will = fingerprintMocks(file, after);
    if (was === null || will === null) return [...running];
    return running.filter((key) => was.get(key) !== will.get(key));
  } catch (error) {
    log.warn(`Could not tell which mocks of ${file} an edit restarts; assuming all`, error);
    return [...running];
  }
}
