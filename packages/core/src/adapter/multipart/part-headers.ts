import { BodyError } from "../body-error";
import { parseContentDisposition } from "./content-disposition";

/** What a part's headers say of it. */
export interface PartHeaders {
  /** The field's name */
  name: string;
  /** The file's name; `undefined` for a text field */
  filename: string | undefined;
  /** The part's `Content-Type` as sent, or `undefined` when it sent none */
  type: string | undefined;
}

const CR = 0x0d;
const LF = 0x0a;
/* RFC 9110 §5.6.2 token characters, a header's name. */
const TOKEN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
/* The space and tabs around a header's value (RFC 9110 §5.6.3). */
const OWS = /^[ \t]+|[ \t]+$/g;
/* The encodings that leave the bytes as they are; RFC 7578 §4.7 retired the others. */
const IDENTITY_ENCODINGS: ReadonlySet<string> = new Set(["7bit", "8bit", "binary"]);
/* A filename arrives in the header as the bytes of its UTF-8, as browsers send it. */
const decoder = new TextDecoder();

/**
 * Read a part's header lines: each ends with CRLF, none is folded onto the
 * next, and each is `name: value`.
 *
 * Only `Content-Disposition`, `Content-Type` and `Content-Transfer-Encoding`
 * mean anything in a form (RFC 7578 §4.8); others are passed over. A bare CR
 * or LF, a folded line, or a header named twice is refused: read leniently,
 * the same bytes could say one thing to the proxy and another to the
 * upstream that receives the form. A `Content-Transfer-Encoding` that
 * changes the bytes — `base64`, `quoted-printable` — is refused too, rather
 * than forwarded as if the encoded text were the file.
 *
 * @param block - The header lines, each with its CRLF, without the empty line that ends them
 * @returns The part's name, filename and type
 * @throws BodyError `BODY_MALFORMED` for headers that do not parse
 *
 * @example
 * ```ts
 * parsePartHeaders(bytes('Content-Disposition: form-data; name="note"\r\n'));
 * // → { name: "note", filename: undefined, type: undefined }
 * ```
 */
export function parsePartHeaders(block: Uint8Array): PartHeaders {
  const headers = new Map<string, string>();
  let from = 0;
  while (from < block.length) {
    const end = block.indexOf(CR, from);
    if (end === -1 || block[end + 1] !== LF)
      throw malformed("a header line does not end with CRLF");
    const line = block.subarray(from, end);
    if (line.includes(LF)) throw malformed("a header line holds a bare line feed");
    const [name, value] = headerOf(line);
    if (headers.has(name)) throw malformed(`${name} is sent twice`);
    headers.set(name, value);
    from = end + 2;
  }

  const disposition = headers.get("content-disposition");
  if (disposition === undefined) throw malformed("Content-Disposition is missing");
  const encoding = headers.get("content-transfer-encoding")?.toLowerCase();
  if (encoding !== undefined && !IDENTITY_ENCODINGS.has(encoding)) {
    throw malformed("Content-Transfer-Encoding is one other than 7bit, 8bit or binary");
  }
  return { ...parseContentDisposition(disposition), type: headers.get("content-type") };
}

/** A header line as its name, in lower case, and its value. */
function headerOf(line: Uint8Array): [string, string] {
  const colon = line.indexOf(0x3a);
  const name = colon === -1 ? "" : decoder.decode(line.subarray(0, colon));
  /* A line that starts with space or tab folds onto the one before it (RFC 9112 §5.2). */
  if (!TOKEN.test(name)) throw malformed("a header line has no name, or is folded");
  return [name.toLowerCase(), decoder.decode(line.subarray(colon + 1)).replace(OWS, "")];
}

function malformed(reason: string): BodyError {
  return new BodyError("BODY_MALFORMED", `A part's headers do not parse: ${reason}`);
}
