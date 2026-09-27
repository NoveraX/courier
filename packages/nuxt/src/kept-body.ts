import type { IncomingMessage } from "node:http";

/** Where h3 1.x leaves the bytes its `readRawBody` read, for any later reader. */
const H3_RAW_BODY = Symbol.for("h3RawBody");

/**
 * The body h3 or Nitro already took off a request, if one did.
 *
 * Nitro's in-process fetch — which is also how its edge presets serve every
 * request — builds a request that never streams and hangs the body on it as
 * a value. h3's own `readBody`, called by a middleware before the route,
 * spends the stream and keeps the bytes behind a shared symbol. Either way
 * this copy is all that is left of the body.
 *
 * @param req - The Node request inside an h3 1.x event
 * @returns The body; `null` for a request the host built without one; or
 *   `undefined` when nothing was kept and the stream itself is the body
 *
 * @example
 * ```ts
 * const kept = await keptBodyOf(event.node.req);
 * const request = toWebRequest(event.node.req, event.node.res, () => kept);
 * ```
 */
export async function keptBodyOf(req: IncomingMessage): Promise<BodyInit | null | undefined> {
  if (H3_RAW_BODY in req) return asBody(await req[H3_RAW_BODY]);
  if ("rawBody" in req) return asBody(req.rawBody);
  if ("body" in req) return asBody(req.body);
  /* A mock request with no body at all carries none of the above. */
  if ("__unenv__" in req) return null;
  return undefined;
}

/**
 * A kept value as a request body, the way h3 1.x reads it back: bytes and
 * text as they are, a parsed JSON object serialized again.
 */
function asBody(value: unknown): BodyInit | null | undefined {
  if (value === undefined || value === null) return null;
  if (value instanceof Uint8Array) return Uint8Array.from(value);
  if (isBodyInit(value)) return value;
  if (isPlainObject(value)) return JSON.stringify(value);
  return undefined;
}

function isBodyInit(value: unknown): value is BodyInit {
  return (
    typeof value === "string" ||
    value instanceof ArrayBuffer ||
    value instanceof Blob ||
    value instanceof FormData ||
    value instanceof URLSearchParams ||
    value instanceof ReadableStream
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
