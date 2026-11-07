import { BodyError } from "./body-error";
import { type BodyLimits, requestBodyStream } from "./read-body";

/** A request body read as text, or why it was refused. */
export type BodyText = { ok: true; text: string } | { ok: false; error: BodyError };

/**
 * Read a request body as UTF-8 text, held to its limits.
 *
 * Each chunk is decoded as it arrives and let go, so the bytes are never
 * gathered into one buffer next to the text made from them. Bytes that are
 * not UTF-8 are refused rather than replaced: JSON is UTF-8 (RFC 8259), and a
 * replacement character would have changed what the caller sent without a
 * word.
 *
 * @param request - The incoming request
 * @param limits - Its largest size and longest waits
 * @returns The text, or the refusal
 *
 * @example
 * ```ts
 * const body = await readBodyText(request, { maxBytes: 1_048_576 });
 * if (!body.ok) return errorResponse(body.error.status, body.error.message, body.error.code);
 * const value: unknown = JSON.parse(body.text);
 * ```
 */
export async function readBodyText(request: Request, limits: BodyLimits): Promise<BodyText> {
  const reader = requestBodyStream(request, limits).getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false });
  const pieces: string[] = [];
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      pieces.push(decoder.decode(value, { stream: true }));
    }
    pieces.push(decoder.decode());
  } catch (error) {
    if (error instanceof BodyError) return { ok: false, error };
    if (!(error instanceof TypeError)) throw error;
    /* The decoder refused the bytes; the rest of the body is taken off the connection. */
    await reader.cancel();
    return { ok: false, error: new BodyError("BODY_MALFORMED", "The request body is not UTF-8") };
  }
  return { ok: true, text: pieces.join("") };
}
