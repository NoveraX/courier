import { randomId } from "./random-id";

const CRLF = "\r\n";
const LINE_BREAK = /\r\n|\r|\n/g;
const QUOTED_SPECIAL = /[\n\r"]/g;
const ESCAPES: ReadonlyMap<string, string> = new Map([
  ["\n", "%0A"],
  ["\r", "%0D"],
  ['"', "%22"],
]);

/**
 * A boundary for a multipart body Courier writes. On a server it is a UUID
 * from the platform's cryptographic generator, which the client whose bytes
 * fill the parts cannot guess, and so cannot make a part's bytes hold: an
 * upload the proxy sends on as it arrives is re-encoded under a boundary
 * chosen before its files are read.
 *
 * @returns The boundary
 * @example
 * ```ts
 * const boundary = multipartBoundary(); // "----courier-3f9a…"
 * ```
 */
export function multipartBoundary(): string {
  return `----courier-${randomId()}`;
}

/**
 * The delimiter and the header lines that open one part of a form, written
 * as the HTML standard writes them: the name — and a file's name — quoted,
 * with the characters that would end the quote or the line percent-encoded,
 * a line break in a field's name made CRLF, and a file with no type sent as
 * `application/octet-stream`.
 *
 * @param boundary - The body's boundary
 * @param name - The field's name
 * @param file - A file's name and its type, as a `File` holds them
 * @returns The part's opening, up to and including the empty line before its bytes
 * @example
 * ```ts
 * partHead(boundary, "avatar", { filename: "me.png", type: "image/png" });
 * ```
 */
export function partHead(
  boundary: string,
  name: string,
  file?: { filename: string; type: string },
): string {
  const disposition = `Content-Disposition: form-data; name="${escapeQuoted(toCrlf(name))}"`;
  if (file === undefined) return `--${boundary}${CRLF}${disposition}${CRLF}${CRLF}`;
  return (
    `--${boundary}${CRLF}${disposition}; filename="${escapeQuoted(file.filename)}"${CRLF}` +
    `Content-Type: ${file.type || "application/octet-stream"}${CRLF}${CRLF}`
  );
}

/* A bare CR or LF becomes CRLF, as the standard's encoding algorithm requires. */
export function toCrlf(text: string): string {
  return text.replace(LINE_BREAK, CRLF);
}

/* Inside the quoted name and filename, the characters that would end the
   quote or the header line are percent-encoded. */
function escapeQuoted(text: string): string {
  return text.replace(QUOTED_SPECIAL, (char) => ESCAPES.get(char) ?? char);
}
