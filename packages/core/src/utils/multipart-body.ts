import { multipartBoundary, partHead, toCrlf } from "./multipart-framing";

/**
 * A FormData body as a Blob, built without reading its files.
 *
 * Composed from the entries themselves, the Blob knows its size at once and
 * reads each file only as it is sent; encoding the body to learn its size
 * would hold a 400 MB upload in memory — twice — before the first byte went
 * out.
 */

const CRLF = "\r\n";

/** A multipart body and the content type that names its boundary. */
export interface MultipartBody {
  blob: Blob;
  contentType: string;
}

/**
 * Encode form entries as `multipart/form-data`, as the HTML standard does.
 *
 * @param form - The entries to encode
 * @returns The body and its content type
 *
 * @example
 * ```ts
 * const { blob, contentType } = encodeMultipart(form);
 * await fetch(url, { method: "POST", body: blob, headers: { "content-type": contentType } });
 * ```
 */
export function encodeMultipart(form: FormData): MultipartBody {
  const boundary = multipartBoundary();
  const parts: BlobPart[] = [];

  for (const [name, value] of form) {
    if (typeof value === "string") {
      parts.push(`${partHead(boundary, name)}${toCrlf(value)}${CRLF}`);
      continue;
    }
    parts.push(partHead(boundary, name, { filename: value.name, type: value.type }), value, CRLF);
  }
  parts.push(`--${boundary}--${CRLF}`);

  return { blob: new Blob(parts), contentType: `multipart/form-data; boundary=${boundary}` };
}
