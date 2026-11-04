import { BodyError } from "../body-error";

/* RFC 2046 §5.1.1: 1 to 70 of these, the last not a space. */
const BOUNDARY = /^[0-9A-Za-z'()+_,\-./:=? ]{0,69}[0-9A-Za-z'()+_,\-./:=?]$/;
/* RFC 9110 §5.6.2 token characters. */
const TOKEN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

/**
 * The boundary a multipart body's `Content-Type` names.
 *
 * The parameter is a token or a quoted string (RFC 9110 §5.6.6), and its
 * value what RFC 2046 allows a boundary to be. Read here rather than by a
 * pattern over the whole header, a quoted boundary holding a `;` or a
 * parameter named like it, `xboundary`, is read for what it is.
 *
 * @param contentType - The request's `Content-Type`
 * @returns The boundary
 * @throws BodyError `BODY_MALFORMED` when there is no boundary, or it is not one
 *
 * @example
 * ```ts
 * boundaryOf('multipart/form-data; boundary="----courier-1a2b"'); // → "----courier-1a2b"
 * ```
 */
export function boundaryOf(contentType: string): string {
  let at = contentType.indexOf(";");
  while (at !== -1) {
    const equals = contentType.indexOf("=", at);
    if (equals === -1) break;
    const name = contentType
      .slice(at + 1, equals)
      .trim()
      .toLowerCase();
    const { value, end } = parameterValue(contentType, equals + 1);
    if (name === "boundary") {
      if (value !== undefined && BOUNDARY.test(value)) return value;
      break;
    }
    if (value === undefined || !TOKEN.test(name)) break;
    at = contentType.indexOf(";", end);
  }
  throw new BodyError(
    "BODY_MALFORMED",
    "The multipart body's Content-Type names no valid boundary",
  );
}

/** A parameter's value from `start`: a quoted string, or a token up to the next `;`. */
function parameterValue(header: string, start: number): { value: string | undefined; end: number } {
  if (header[start] !== '"') {
    const end = header.indexOf(";", start);
    const value = header.slice(start, end === -1 ? undefined : end).trim();
    return { value: TOKEN.test(value) ? value : undefined, end: end === -1 ? header.length : end };
  }
  let value = "";
  for (let at = start + 1; at < header.length; at++) {
    const char = header[at];
    if (char === '"') return { value, end: at + 1 };
    if (char === "\\") at += 1;
    value += header[at] ?? "";
  }
  return { value: undefined, end: header.length };
}
