import { sha256Hex } from "../utils/sha256-hex";
import type { CacheScope } from "./cache";
import type { MiddlewareContext } from "./types";

/**
 * The key a call's answer is cached under: the partition its scope names,
 * then its endpoint, its transport and its variables.
 *
 * @param ctx - The call
 * @param scope - How answers are partitioned between callers
 * @returns The key
 * @example
 * ```ts
 * const key = await cacheKey(ctx, "session");
 * ```
 */
export async function cacheKey(ctx: MiddlewareContext, scope: CacheScope): Promise<string> {
  const partition =
    scope === "public" ? "public" : scope === "session" ? await credentialsOf(ctx) : scope(ctx);
  return [
    partition,
    ctx.source,
    ctx.group ?? "",
    ctx.method,
    ctx.transport ?? "http",
    JSON.stringify(ctx.variables ?? {}),
  ].join("\u0000");
}

/* The credentials themselves would sit in the store's keys — a Redis keyspace,
   a log line — so a partition is named by their digest instead. In a browser
   or an app the session names the partition, the cookies being the
   platform's to send. */
async function credentialsOf(ctx: MiddlewareContext): Promise<string> {
  const material = ctx.sessionPartition ?? credentialHeaders(ctx);
  if (material === "") return "anonymous";
  return `session:${await sha256Hex(material)}`;
}

function credentialHeaders(ctx: MiddlewareContext): string {
  const cookie = ctx.headers.get("cookie") ?? "";
  const authorization = ctx.headers.get("authorization") ?? "";
  return cookie === "" && authorization === "" ? "" : `${cookie}\u0000${authorization}`;
}
