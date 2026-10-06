import { randomId } from "./random-id";

/**
 * A FormData body as a Blob, built without reading its files.
 *
 * Composed from the entries themselves, the Blob knows its size at once and
 * reads each file only as it is sent; encoding the body to learn its size
 * would hold a 400 MB upload in memory — twice — before the first byte went
 * out.
 */

const CRLF = "\r\n";
const LINE_BREAK = /\r\n|\r|\n/g;
const QUOTED_SPECIAL = /[\n\r"]/g;
const ESCAPES: ReadonlyMap<string, string> = new Map([
  ["\n", "%0A"],
  ["\r", "%0D"],
  ['"', "%22"],
]);

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
  const boundary = `----courier-${randomId()}`;
  const parts: BlobPart[] = [];

  for (const [name, value] of form) {
    const disposition = `Content-Disposition: form-data; name="${escapeQuoted(toCrlf(name))}"`;
    if (typeof value === "string") {
      parts.push(`--${boundary}${CRLF}${disposition}${CRLF}${CRLF}${toCrlf(value)}${CRLF}`);
      continue;
    }
    const type = value.type || "application/octet-stream";
    parts.push(
      `--${boundary}${CRLF}${disposition}; filename="${escapeQuoted(value.name)}"${CRLF}` +
        `Content-Type: ${type}${CRLF}${CRLF}`,
      value,
      CRLF,
    );
  }
  parts.push(`--${boundary}--${CRLF}`);

  return { blob: new Blob(parts), contentType: `multipart/form-data; boundary=${boundary}` };
}

/* A bare CR or LF in a name or a text value becomes CRLF, as the standard's
   encoding algorithm requires. */
function toCrlf(text: string): string {
  return text.replace(LINE_BREAK, CRLF);
}

/* Inside the quoted name and filename, the characters that would end the
   quote or the header line are percent-encoded. */
function escapeQuoted(text: string): string {
  return text.replace(QUOTED_SPECIAL, (char) => ESCAPES.get(char) ?? char);
}
