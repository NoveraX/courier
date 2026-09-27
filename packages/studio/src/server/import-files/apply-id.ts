import { randomBytes } from "node:crypto";

const APPLY_ID = /^\d+-[0-9a-f]{8}$/;

/**
 * A new apply's id: the time it began, so ids sort oldest first, and a
 * random part.
 *
 * @returns The id, such as `1759000000000-0a1b2c3d`
 */
export function newApplyId(): string {
  return `${Date.now()}-${randomBytes(4).toString("hex")}`;
}

/**
 * Tell whether a name is an apply's id, as Studio makes them: nothing else
 * in `.courier/journal` or `.courier/backups` is Studio's to act on.
 *
 * @param name - A journal's id, or a backup folder's name
 * @returns Whether it has the form of an apply id
 * @example
 * ```ts
 * isApplyId("1759000000000-0a1b2c3d"); // true
 * isApplyId("../keep"); // false
 * ```
 */
export function isApplyId(name: string): boolean {
  return APPLY_ID.test(name);
}
