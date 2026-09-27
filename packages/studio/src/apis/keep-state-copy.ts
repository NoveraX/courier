import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createLogger } from "@noverax/courier";

const log = createLogger("Studio");

/**
 * Keep the imports state Studio is about to set aside, before anything
 * replaces it: in `<file>.<suffix>`, or, when that holds other content
 * already, in a copy named by the content's hash. Content kept once is not
 * kept again, however often the state is read before it is next saved.
 *
 * @param path - The imports state file
 * @param suffix - Why it is set aside: `corrupt`, `invalid` or `v<version>`
 * @param raw - Its content
 * @returns Whether the content is kept
 * @example
 * ```ts
 * if (!keepStateCopy(path, "corrupt", raw)) intact = false;
 * ```
 */
export function keepStateCopy(path: string, suffix: string, raw: string): boolean {
  const first = `${path}.${suffix}`;
  const second = `${first}-${createHash("sha256").update(raw).digest("hex").slice(0, 12)}`;
  if (holds(first, raw) || holds(second, raw)) return true;
  const copy = existsSync(first) ? second : first;
  try {
    writeFileSync(copy, raw, { encoding: "utf-8", flag: "wx" });
    log.warn(`The previous imports-state was saved to ${copy}`);
    return true;
  } catch (err) {
    log.warn(`Could not save the previous imports-state to ${copy}`, err);
    return false;
  }
}

function holds(path: string, raw: string): boolean {
  try {
    return readFileSync(path, "utf-8") === raw;
  } catch (err) {
    log.debug(`No earlier copy of the imports-state at ${path}`, err);
    return false;
  }
}
