import { browserLogger } from "../../logger/browser";
import type { Logger } from "../../logger/types";

/**
 * The server's logger, as a page's bundle has it: the devtools console's.
 * A bundler that builds for the browser takes this module in place of the
 * terminal logger — its colours, its JSON lines, its levels read from the
 * environment — which a page never runs.
 *
 * @example
 * ```ts
 * serverLogger.warn("Session", "The API set no session cookie");
 * ```
 */
export const serverLogger: Logger = browserLogger;
