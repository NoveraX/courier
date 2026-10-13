import { jsonStringsRewritten } from "./json-strings-rewritten";

/* A body a text: a page, a message, JSON, a script. A body of any other type is bytes. */
const TEXT_TYPE = /^text\/|[/+]json\b|^application\/(?:javascript|xml)\b/i;
const JSON_TYPE = /[/+]json\b/i;

/**
 * A body on its way to the socket, rewritten when it is text: JSON as its
 * values, so every escape in it stays one, any other text whole. A string
 * stays a string and bytes stay bytes, UTF-8 either way.
 *
 * @param chunk - What `res.end` was handed: a string, bytes, or anything else
 * @param type - The answer's `Content-Type`, empty when it has none
 * @param rewrite - What rewrites a text
 * @returns The body to send instead, or `undefined` when it is not text or nothing in it changes
 * @example
 * ```ts
 * sentTextRewritten(Buffer.from("ENOENT, open '/Users/ana/x'"), "text/html; charset=utf-8", scrub);
 * // → <Buffer "ENOENT, open '~/x'">
 * ```
 */
export function sentTextRewritten(
  chunk: unknown,
  type: string,
  rewrite: (text: string) => string,
): string | Buffer | undefined {
  const text = textOf(chunk, type);
  if (text === undefined) return undefined;
  const shown = rewrite(text);
  if (shown === text) return undefined;
  const body = JSON_TYPE.test(type) ? (jsonRewritten(text, rewrite) ?? shown) : shown;
  return typeof chunk === "string" ? body : Buffer.from(body, "utf8");
}

function textOf(chunk: unknown, type: string): string | undefined {
  if (typeof chunk === "string") return chunk;
  return Buffer.isBuffer(chunk) && TEXT_TYPE.test(type) ? chunk.toString("utf8") : undefined;
}

function jsonRewritten(text: string, rewrite: (text: string) => string): string | undefined {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    /* JSON by its type alone: it is rewritten as the text it is. */
    return undefined;
  }
  return JSON.stringify(jsonStringsRewritten(value, rewrite));
}
