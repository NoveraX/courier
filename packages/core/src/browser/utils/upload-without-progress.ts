import { createLogger } from "../../logger";

const log = createLogger("Caller");
let told = false;

/**
 * An upload whose progress reporting did not load, as a page's bundle has
 * it: the upload goes as any body does, said once a page. A page's form
 * holds no device's file — only a React Native app's does — so nothing is
 * refused here. A bundler that builds for the browser takes this module in
 * place of the one that refuses such a file.
 *
 * @param _body - The upload
 * @param cause - Why the progress reporting did not load
 * @example
 * ```ts
 * uploadWithoutProgress(body, cause);
 * ```
 */
export function uploadWithoutProgress(_body: unknown, cause: unknown): void {
  if (told) return;
  told = true;
  log.warn("upload progress did not load", cause);
}
