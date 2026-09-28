import { lstatSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { createLogger } from "@noverax/courier";

const log = createLogger("Runtime");

/* 32 random bytes, base64url — what Studio writes. */
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

let reported = false;

/**
 * The Studio token of the project a server runtime belongs to, read from
 * `.courier/studio-token` beside its `courier.config`. Studio sends Playground
 * calls only to a runtime that presents it. There is none before Studio has
 * run on the project, or when the file is not one Studio wrote.
 *
 * Read afresh for each connection to Studio, so a runtime started before
 * Studio presents the token Studio wrote once it came up.
 *
 * @param projectRoot - The directory holding the project's `courier.config`
 * @returns The token, or `undefined`
 *
 * @example
 * ```ts
 * const token = readStudioToken(dirname(loaded.configFile));
 * ```
 */
export function readStudioToken(projectRoot: string): string | undefined {
  const path = join(projectRoot, ".courier", "studio-token");
  try {
    const stats = lstatSync(path, { throwIfNoEntry: false });
    if (!stats?.isFile()) return undefined;
    const text = readFileSync(path, "utf8").trim();
    return TOKEN.test(text) ? text : undefined;
  } catch (error) {
    /* Once: the runtime asks again on every reconnect. */
    if (!reported) log.warn(`Studio's token could not be read from ${path}`, error);
    reported = true;
    return undefined;
  }
}
