/**
 * How the proxy's answer carries a body that JSON cannot.
 *
 * The proxy answered every call with JSON, and an ArrayBuffer, a Blob or a
 * FormData serializes to `{}` — a binary download resolved to an empty
 * object in the browser. Such a body travels as itself, and its content
 * type — the one response header a browser reads on a cross-origin answer
 * without being allowed to — tells the proxy client how to read it back.
 */

import { getResponseData } from "../http-client/response";
import type { WebBody } from "../http-client/web-types";

/** Bytes read back as an ArrayBuffer. */
const BYTES_TYPE = "application/vnd.courier.bytes";
/** Bytes read back as a Blob; its own type travels as the `type` parameter. */
const BLOB_TYPE = "application/vnd.courier.blob";
const MULTIPART_TYPE = "multipart/form-data";

/** A body the proxy sends as it is, rather than as JSON. */
export interface WireBody {
  body: WebBody;
  /** The answer's content type; a FormData's own multipart type when absent. */
  contentType?: string;
  /** Its length in bytes, when it is known before it is sent. */
  size?: number;
}

/**
 * Recognise data that would not survive JSON.
 *
 * @param data - What the endpoint resolved to
 * @returns The body to send as it is, or `undefined` for JSON data
 *
 * @example
 * ```ts
 * toWireBody(new ArrayBuffer(8)); // → { body, contentType: "application/vnd.courier.bytes", size: 8 }
 * toWireBody({ id: 1 });          // → undefined
 * ```
 */
export function toWireBody(data: unknown): WireBody | undefined {
  if (data instanceof ArrayBuffer) {
    return { body: data, contentType: BYTES_TYPE, size: data.byteLength };
  }
  if (ArrayBuffer.isView(data)) {
    const { buffer, byteOffset, byteLength } = data;
    /* A view of shared memory cannot be a body; its bytes are copied out. */
    const body =
      buffer instanceof ArrayBuffer
        ? new Uint8Array(buffer, byteOffset, byteLength)
        : new Uint8Array(buffer, byteOffset, byteLength).slice();
    return { body, contentType: BYTES_TYPE, size: body.byteLength };
  }
  if (data instanceof Blob) {
    const type = data.type ? `; type=${encodeURIComponent(data.type)}` : "";
    return { body: data, contentType: `${BLOB_TYPE}${type}`, size: data.size };
  }
  if (data instanceof FormData) return { body: data };
  return undefined;
}

/**
 * Whether a proxy answer carries its body as itself rather than as JSON.
 *
 * @param response - The proxy's answer
 * @returns `true` for bytes, a Blob or a FormData
 */
export function isWireBody(response: Response): boolean {
  const mediaType = mediaTypeOf(response);
  return mediaType === BYTES_TYPE || mediaType === BLOB_TYPE || mediaType === MULTIPART_TYPE;
}

/**
 * Read a proxy answer's body the way the proxy sent it.
 *
 * @param response - The proxy's answer
 * @returns The body — bytes, a Blob or a FormData as marked, JSON otherwise
 *
 * @example
 * ```ts
 * const bytes = await readWireBody(response); // ArrayBuffer for a bytes answer
 * ```
 */
export async function readWireBody(response: Response): Promise<unknown> {
  switch (mediaTypeOf(response)) {
    case BYTES_TYPE:
      return response.arrayBuffer();
    case BLOB_TYPE: {
      const blob = await response.blob();
      return new Blob([blob], { type: blobTypeOf(response) });
    }
    case MULTIPART_TYPE:
      return response.formData();
    default:
      /* A bodiless status reads as null here, as it does in direct mode. */
      return getResponseData(response, "json");
  }
}

function mediaTypeOf(response: Response): string {
  return (response.headers.get("content-type") ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
}

function blobTypeOf(response: Response): string {
  const parameters = (response.headers.get("content-type") ?? "").split(";").slice(1);
  const type = parameters.map((p) => p.trim()).find((p) => p.startsWith("type="));
  return type ? decodeURIComponent(type.slice("type=".length)) : "";
}
