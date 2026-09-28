import { logger } from "@noverax/courier";
import type { Context as HonoContext } from "hono";

/** A request body read as JSON: its value, or why it could not be read */
export type JsonBody = { value: unknown } | { error: string };

/**
 * Read a request's body as JSON.
 *
 * An empty body reads as `undefined`, a call that sends no variables. A body
 * that does not parse is reported rather than thrown, so the route answers
 * 400 with a JSON error instead of failing with a 500 and a stack trace.
 *
 * @param c - The request's Hono context
 * @returns The parsed value, or the error to answer with
 * @example
 * ```ts
 * const body = await readJsonBody(c);
 * if ("error" in body) return c.json({ error: body.error }, 400);
 * ```
 */
export async function readJsonBody(c: HonoContext): Promise<JsonBody> {
  const text = await c.req.text();
  if (text.trim() === "") return { value: undefined };
  try {
    return { value: JSON.parse(text) };
  } catch (error) {
    logger.debug("MockServer", `Unparseable body on ${c.req.method} ${c.req.path}`, error);
    return { error: "The request body is not valid JSON" };
  }
}
