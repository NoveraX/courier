import { createLogger } from "../../logger";

const log = createLogger("Caller");
let told = false;

/**
 * A request whose progress reporting did not load, as a page's bundle has
 * it: an upload goes as any body does, and a download uncounted, said once
 * a page. A page's form holds no device's file — only a React Native app's
 * does — so nothing is refused here. A bundler that builds for the browser
 * takes this module in place of the one that refuses such a file.
 *
 * @param cause - Why the progress reporting did not load
 * @param _body - The request's body, when what did not load was its sending
 * @returns Nothing, which a download takes as no counter, and is read uncounted
 * @example
 * ```ts
 * withoutProgress(cause, body);
 * ```
 */
export function withoutProgress(cause: unknown, _body?: unknown): undefined {
  if (told) return;
  told = true;
  log.warn("progress reporting did not load", cause);
}
