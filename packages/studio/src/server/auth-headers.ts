import type { CourierImportAuth } from "@noverax/courier/config";

/**
 * The request headers an import's `auth` asks a private specification to
 * be fetched with.
 *
 * @param auth - The import's `auth`, if it declares one
 * @returns The headers; none without `auth`
 * @example
 * ```ts
 * authHeaders({ type: "bearer", token: "t0k3n" }); // → { authorization: "Bearer t0k3n" }
 * ```
 */
export function authHeaders(auth: CourierImportAuth | undefined): Record<string, string> {
  if (auth === undefined) return {};
  if (auth.type === "bearer") return { authorization: `Bearer ${auth.token}` };
  if (auth.type === "basic") {
    const credentials = Buffer.from(`${auth.username}:${auth.password}`).toString("base64");
    return { authorization: `Basic ${credentials}` };
  }
  return { ...auth.headers };
}
