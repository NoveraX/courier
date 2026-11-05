import { addressTag } from "../logger/address-tag";
import type { RefusalFields } from "../logger/refusal-log";
import type { WSSocketContext } from "./ws-context";

/**
 * What names a connection in a refusal's line: its id, and a tag of the
 * address it is counted against — never the address itself.
 *
 * @param ctx - The connection
 * @returns The fields
 * @example
 * ```ts
 * ctx.refusals.warn({ event: "connection refused", code: 4401, fields: connectionFields(ctx) }, error);
 * ```
 */
export function connectionFields(ctx: WSSocketContext): RefusalFields {
  return { conn: ctx.connectionId, addr: addressTag(ctx.clientIP) };
}
