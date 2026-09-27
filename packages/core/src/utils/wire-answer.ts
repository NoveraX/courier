import { isBodilessStatus } from "../http-client/response";
import { toWireBody, WIRE_BODY_HEADER, WIRE_BODY_TYPE_HEADER } from "./wire-body";

/**
 * The proxy's answer to a call whose body was read on the server.
 *
 * JSON by default. Data JSON cannot carry — bytes, a Blob, a FormData —
 * travels as itself, marked so the proxy client reads it back as what it
 * was. Bytes are served as `application/octet-stream` whatever the upstream
 * called them: this answer comes from the application's own origin.
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
    headers.set(WIRE_BODY_HEADER, wire.kind);
    if (wire.type) headers.set(WIRE_BODY_TYPE_HEADER, wire.type);
    if (wire.kind !== "formData") {
      headers.set("content-type", "application/octet-stream");
      headers.set("x-content-type-options", "nosniff");
    }
    return new Response(wire.body, { status, headers });
  }

  /* JSON has no Headers, so the raw envelope carries them as a plain
     object; serialized as they were, they arrived as `{}`. */
  const body = rawData ? { status, headers: Object.fromEntries(headers), data } : data;
  return Response.json(body, { status, headers });
}
