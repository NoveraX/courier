import { isBodilessStatus } from "../http-client/response";
import { toWireBody } from "./wire-body";

/* Made when first needed, so an engine without TextEncoder still loads the client. */
let jsonEncoder: TextEncoder | undefined;

/**
 * The proxy's answer to a call whose body was read on the server.
 *
 * JSON by default. Data JSON cannot carry — bytes, a Blob, a FormData —
 * travels as itself under a content type that tells the proxy client how to
 * read it back. Bytes never go out under the upstream's own content type:
 * this answer comes from the application's origin, where an upstream's
 * `text/html` would be rendered as the application's page.
 *
 * @param status - The upstream's status
 * @param headers - The upstream headers the browser may see
 * @param data - What the endpoint resolved to
 * @param rawData - Whether the caller asked for `{ status, headers, data }`
 * @returns The Response to send
 *
 * @example
 * ```ts
 * toWireAnswer(200, new Headers(), { id: 1 }, false); // JSON {"id":1}
 * ```
 */
export function toWireAnswer(
  status: number,
  headers: Headers,
  data: unknown,
  rawData: boolean,
): Response {
  if (isBodilessStatus(status)) return new Response(null, { status, headers });

  const wire = toWireBody(data);
  if (wire) {
    if (wire.contentType) headers.set("content-type", wire.contentType);
    headers.set("x-content-type-options", "nosniff");
    if (wire.size !== undefined) headers.set("content-length", String(wire.size));
    return new Response(wire.body, { status, headers });
  }

  /* JSON has no Headers, so the raw envelope carries them as a plain
     object; serialized as they were, they arrived as `{}`. */
  const envelope = rawData ? { status, headers: Object.fromEntries(headers), data } : data;
  /* JSON has no `undefined`: a success without data answers `null`. */
  jsonEncoder ??= new TextEncoder();
  const bytes = jsonEncoder.encode(JSON.stringify(envelope ?? null));
  headers.set("content-type", "application/json");
  /* Without a length the answer went out chunked, and a download progress
     bar in the browser never learned its total. */
  headers.set("content-length", String(bytes.byteLength));
  return new Response(bytes, { status, headers });
}
