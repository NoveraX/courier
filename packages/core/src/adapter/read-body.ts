/**
 * Reading a proxy request body without letting the caller choose how much
 * memory the server spends on it.
 *
 * `Request.json()` and `Request.formData()` buffer whatever arrives. A caller
 * that opens a chunked request and keeps writing holds the process's memory
 * for as long as it likes, and the proxy is reachable by anyone the origin
 * check admits. `Content-Length` is the cheap half of the answer and not the
 * whole one: it is absent on a chunked request, and a caller that wants to
 * spend the server's memory simply omits it.
 */

/**
 * Outcome of a bounded read: the bytes, or the limit that stopped them.
 *
 * The buffer is spelled out as `ArrayBuffer`-backed rather than left to the
 * default, because `BodyInit` refuses a view that might sit on shared memory.
 */
export type BoundedBody =
  | { ok: true; bytes: Uint8Array<ArrayBuffer> }
  | { ok: false; limit: number };

/**
 * Read a request body, giving up as soon as it exceeds `limit` bytes.
 *
 * Declared oversize is refused before a byte is read; undeclared oversize is
 * refused at the chunk that crosses the line, so the peak cost of a hostile
 * request is one chunk over the limit rather than the whole body. The rest of
 * a refused body is left where it is, for the caller to discard with
 * `discardBody` as it answers.
 *
 * @param request - The incoming proxy request
 * @param limit - Largest body to accept, in bytes
 * @returns The bytes, or the limit that refused them
 *
 * @example
 * ```ts
 * const body = await readBoundedBody(request, 1_048_576);
 * if (!body.ok) {
 *   discardBody(request);
 *   return errorResponse(413, `Body exceeds ${body.limit} bytes`);
 * }
 * ```
 */
export async function readBoundedBody(request: Request, limit: number): Promise<BoundedBody> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > limit) return { ok: false, limit };

  const body = request.body;
  if (!body) return { ok: true, bytes: new Uint8Array(0) };

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) return { ok: false, limit };
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.byteLength;
  }
  return { ok: true, bytes };
}
