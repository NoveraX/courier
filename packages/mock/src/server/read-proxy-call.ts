import type { Context as HonoContext } from "hono";

import { readJsonBody } from "./read-json-body";

/** The endpoint call a proxy request names, or why the request cannot be read */
export type ProxyCall =
  | { group: string; method: string; variables: unknown; raw: boolean }
  | { error: string };

/**
 * Read the call a `POST /api/request` body names: `{ group, method, variables }`,
 * and whether it is a `.raw` call (`options.rawData`), which is answered with
 * the response around the data. A body that is not JSON, or is JSON but not
 * an object, gives the error to answer 400 with.
 *
 * @param c - The request's Hono context
 * @returns The group, method, variables and raw flag, or the error to answer with
 * @example
 * ```ts
 * const call = await readProxyCall(c);
 * if ("error" in call) return c.json({ error: call.error }, 400);
 * ```
 */
export async function readProxyCall(c: HonoContext): Promise<ProxyCall> {
  const body = await readJsonBody(c);
  if ("error" in body) return body;
  const { value } = body;
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { error: "The request body must be a JSON object naming the group and method" };
  }
  const group = "group" in value && typeof value.group === "string" ? value.group : "";
  const method = "method" in value && typeof value.method === "string" ? value.method : "";
  const options = "options" in value ? value.options : undefined;
  const raw =
    typeof options === "object" &&
    options !== null &&
    "rawData" in options &&
    options.rawData === true;
  return { group, method, variables: "variables" in value ? value.variables : undefined, raw };
}
