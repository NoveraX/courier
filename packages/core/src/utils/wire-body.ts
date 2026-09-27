/**
 * How the proxy's answer carries a body that JSON cannot.
 *
 * The proxy answered every call with JSON, and an ArrayBuffer, a Blob or a
 * FormData serializes to `{}` — a binary download resolved to an empty
 * object in the browser. Such a body now travels as itself, and a header
 * tells the proxy client how to read it back.
 */

import { getResponseData } from "../http-client/response";

/** Names how to read the body; absent for a JSON answer. */
export const WIRE_BODY_HEADER = "x-courier-body";

/** A Blob's own type, which the answer's content type does not carry. */
export const WIRE_BODY_TYPE_HEADER = "x-courier-body-type";

export type WireBodyKind = "arrayBuffer" | "blob" | "formData";

/** A body the proxy sends as it is, rather than as JSON. */
export interface WireBody {
  kind: WireBodyKind;
  body: BodyInit;
  /** A Blob's type, when it has one. */
  type?: string;
}

/**
 * Recognise data that would not survive JSON.
 *
 * @param data - What the endpoint resolved to
 * @returns The body to send as it is, or `undefined` for JSON data
 *
 * @example
 * ```ts
 * toWireBody(new ArrayBuffer(8)); // → { kind: "arrayBuffer", body: … }
 * toWireBody({ id: 1 });          // → undefined
 * ```
 */
export function toWireBody(data: unknown): WireBody | undefined {
  if (data instanceof ArrayBuffer) return { kind: "arrayBuffer", body: data };
  if (ArrayBuffer.isView(data)) {
    const { buffer, byteOffset, byteLength } = data;
    /* A view of shared memory cannot be a body; its bytes are copied out. */
    const body =
      buffer instanceof ArrayBuffer
        ? new Uint8Array(buffer, byteOffset, byteLength)
        : new Uint8Array(buffer, byteOffset, byteLength).slice();
    return { kind: "arrayBuffer", body };
  }
  if (data instanceof Blob) return { kind: "blob", body: data, type: data.type || undefined };
  if (data instanceof FormData) return { kind: "formData", body: data };
  return undefined;
}

/**
 * Read a proxy answer's body the way the proxy sent it.
 *
 * @param response - The proxy's answer
 * @returns The body — bytes, a Blob or a FormData as marked, JSON otherwise
 *
 * @example
 * ```ts
 * const bytes = await readWireBody(response); // ArrayBuffer for an "arrayBuffer" answer
 * ```
 */
export async function readWireBody(response: Response): Promise<unknown> {
  switch (response.headers.get(WIRE_BODY_HEADER)) {
    case "arrayBuffer":
      return response.arrayBuffer();
    case "blob": {
      const blob = await response.blob();
      return new Blob([blob], { type: response.headers.get(WIRE_BODY_TYPE_HEADER) ?? "" });
    }
    case "formData":
      return response.formData();
    default:
      /* A bodiless status reads as null here, as it does in direct mode. */
      return getResponseData(response, "json");
  }
}
