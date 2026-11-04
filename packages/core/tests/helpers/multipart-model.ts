import { BodyError } from "../../src/adapter/body-error";
import { parsePartHeaders } from "../../src/adapter/multipart/part-headers";
import { bytes, type ReadPart } from "./multipart-fixtures";

/**
 * The parser's rules applied to a whole body held in one buffer, the
 * plainest way they can be: a search for the delimiter with `indexOf`, a
 * byte at a time elsewhere. A test holds the streaming parser, cut any way,
 * to what this reads.
 */
export function modelParts(
  body: Uint8Array,
  boundary: string,
  limits: { maxParts: number; maxHeaderBytes: number },
): ReadPart[] {
  const delimiter = bytes(`\r\n--${boundary}`);
  const opening = delimiter.subarray(2);
  let at = startsWith(body, opening, 0) ? opening.length : indexOf(body, delimiter, 0);
  if (at === -1) throw malformed();
  if (at !== opening.length) at += delimiter.length;

  const parts: ReadPart[] = [];
  for (;;) {
    if (body[at] === 0x2d) {
      if (body[at + 1] === 0x2d) return parts;
      throw malformed();
    }
    let padding = 0;
    while (body[at] === 0x20 || body[at] === 0x09) {
      if (padding === limits.maxHeaderBytes + 4) throw malformed();
      padding += 1;
      at += 1;
    }
    if (body[at] !== 0x0d || body[at + 1] !== 0x0a) throw malformed();
    at += 2;
    if (parts.length === limits.maxParts) throw new BodyError("UPLOAD_TOO_MANY_PARTS", "");

    const end = headersEnd(body, at, limits.maxHeaderBytes + 4);
    const headers = parsePartHeaders(body.subarray(at, end));
    at = end + 2;

    const next = indexOf(body, delimiter, at);
    if (next === -1) throw malformed();
    parts.push({ ...headers, bytes: body.slice(at, next) });
    at = next + delimiter.length;
  }
}

/* Where the empty line that ends a part's headers starts, scanning no more than `room` bytes. */
function headersEnd(body: Uint8Array, from: number, room: number): number {
  for (let at = from; at < from + room; at++) {
    if (at >= body.length) throw malformed();
    if (body[at] !== 0x0a) continue;
    if (body[at - 1] !== 0x0d || at === from) throw malformed();
    if (at === from + 1) return from;
    if (body[at - 2] === 0x0a) return at - 1;
  }
  throw new BodyError("UPLOAD_PART_HEADERS_TOO_LARGE", "");
}

function startsWith(haystack: Uint8Array, needle: Uint8Array, at: number): boolean {
  return needle.every((byte, offset) => haystack[at + offset] === byte);
}

function indexOf(haystack: Uint8Array, needle: Uint8Array, from: number): number {
  for (let at = from; at + needle.length <= haystack.length; at++) {
    if (startsWith(haystack, needle, at)) return at;
  }
  return -1;
}

function malformed(): BodyError {
  return new BodyError("BODY_MALFORMED", "");
}
