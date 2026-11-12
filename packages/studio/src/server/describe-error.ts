import { withoutSecrets } from "@noverax/courier-build/config";
import { messageOf } from "@noverax/courier-cli/devkit";
import { pathScrubber } from "./machine-paths";
import { machineSpellings } from "./machine-spellings";

/**
 * An error as one line a page shows: its message with no secret left in
 * it, as a load error leaves none — the environment's values masked and
 * every credential cut, each found in the text as it was thrown — its line
 * breaks folded, since the loader's messages span lines, and no path named
 * as it is on this machine: every page sees it, a page without the
 * project's token too, and the log writes it. A path in the project is
 * named relative to it, the project root itself as "the project root", any
 * other path under the home directory from `~` and under the temporary
 * directory from `<temp>`. The terminal log keeps the error whole otherwise.
 *
 * @param error - What was thrown
 * @param root - The project root, when paths in it should be named relative to it
 * @returns The message on one line
 *
 * @example
 * ```ts
 * describeError(new Error("ParseError: Unexpected token \n /app/courier.mocks.ts:3:2"), "/app");
 * // → "ParseError: Unexpected token courier.mocks.ts:3:2"
 * ```
 */
export function describeError(error: unknown, root?: string): string {
  const scrub = pathScrubber(machineSpellings({ project: root === undefined ? [] : [root] }));
  /* The secrets first, in the text as it was thrown: a path taken off first could hold a value. */
  return scrub(withoutSecrets(messageOf(error)))
    .replace(/\s+/g, " ")
    .trim();
}
