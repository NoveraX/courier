import { isFormData } from "./helpers";

/**
 * A value `fetch` sends as a request body as it stands: bytes, a stream, or
 * form fields already encoded. Nothing of it is a named variable, so it fills
 * no path parameter and is never serialized as JSON.
 */
export type RawBody = Blob | ArrayBuffer | ArrayBufferView | ReadableStream | URLSearchParams;

/**
 * Whether variables are a request body in their own right.
 *
 * @param value - The variables a call was given
 * @returns True for a Blob or File, an ArrayBuffer or a view of one, a
 *   ReadableStream, or URLSearchParams
 *
 * @example
 * ```ts
 * isRawBody(new Blob(["x"]));     // → true
 * isRawBody(new Uint8Array([1])); // → true
 * isRawBody({ id: 1 });           // → false
 * ```
 */
export function isRawBody(value: unknown): value is RawBody {
  return (
    (typeof Blob !== "undefined" && value instanceof Blob) ||
    value instanceof ArrayBuffer ||
    ArrayBuffer.isView(value) ||
    (typeof ReadableStream !== "undefined" && value instanceof ReadableStream) ||
    (typeof URLSearchParams !== "undefined" && value instanceof URLSearchParams)
  );
}

/**
 * Whether variables are a set of named values — the shape whose entries fill
 * path parameters and become the query string or the JSON body.
 *
 * A list, a JSON scalar, form data and a raw body are each sent whole, so none
 * of them counts.
 *
 * @param value - The variables a call was given
 * @returns True for an object that is none of the above
 *
 * @example
 * ```ts
 * isFieldRecord({ id: 1 }); // → true
 * isFieldRecord([1, 2]);    // → false
 * isFieldRecord("text");    // → false
 * ```
 */
export function isFieldRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    !isFormData(value) &&
    !isRawBody(value)
  );
}

/**
 * The raw body in the form `fetch` accepts.
 *
 * A view over shared memory is not a valid body, so its bytes are copied out;
 * everything else is passed as it is, without a copy.
 *
 * @param body - A value `isRawBody` accepted
 * @returns The same bytes as a `BodyInit`
 *
 * @example
 * ```ts
 * toBodyInit(new Uint8Array([1, 2])); // → the same Uint8Array
 * ```
 */
export function toBodyInit(body: RawBody): BodyInit {
  if (!ArrayBuffer.isView(body)) return body;
  if (isOwnedView(body)) return body;
  return new Uint8Array(body.buffer, body.byteOffset, body.byteLength).slice();
}

function isOwnedView(view: ArrayBufferView): view is ArrayBufferView<ArrayBuffer> {
  return view.buffer instanceof ArrayBuffer;
}
