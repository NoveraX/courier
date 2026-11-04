import { BodyError } from "../body-error";

/** What a part's `Content-Disposition` says of it. */
export interface Disposition {
  /** The field's name */
  name: string;
  /** The file's name; `undefined` for a text field */
  filename: string | undefined;
}

/* RFC 9110 §5.6.2 token characters, a parameter's name and a bare value. */
const TOKEN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
/* The characters the HTML standard percent-encodes in a quoted name. */
const ESCAPED = /%(0[ad]|22)/gi;
const UNESCAPED: Readonly<Record<string, string>> = { "0a": "\n", "0d": "\r", "22": '"' };

/**
 * Read a part's `Content-Disposition`: `form-data`, its `name`, and its
 * `filename` — or `filename*`, RFC 5987's encoded form, which wins over it.
 *
 * A quoted value is read as browsers write it, under the HTML standard:
 * no backslash escapes — Chrome and Firefox send `a\b.txt` as it is — and
 * `"`, CR and LF arrive percent-encoded, as `%22`, `%0D` and `%0A`. A
 * parameter named twice is refused rather than read one way here and
 * another by the upstream that receives the form.
 *
 * @param value - The header's value
 * @returns The field's name, and the file's when it is a file
 * @throws BodyError `BODY_MALFORMED` for any other disposition, a missing
 *   name, or a value that does not parse
 *
 * @example
 * ```ts
 * parseContentDisposition('form-data; name="avatar"; filename="me.png"');
 * // → { name: "avatar", filename: "me.png" }
 * ```
 */
export function parseContentDisposition(value: string): Disposition {
  const [type = "", ...rest] = splitParameters(value);
  if (type.trim().toLowerCase() !== "form-data") throw malformed("is not form-data");

  const seen = new Map<string, string>();
  for (const parameter of rest) {
    const equals = parameter.indexOf("=");
    const key = (equals === -1 ? parameter : parameter.slice(0, equals)).trim().toLowerCase();
    if (equals === -1 || !TOKEN.test(key)) throw malformed("holds a parameter that does not parse");
    if (seen.has(key)) throw malformed(`names ${key} twice`);
    seen.set(key, parameter.slice(equals + 1).trim());
  }

  const name = seen.get("name");
  if (name === undefined) throw malformed("names no field");
  const extended = seen.get("filename*");
  const filename = seen.get("filename");
  return {
    name: plainValue(name),
    filename:
      extended !== undefined
        ? extendedValue(extended)
        : filename === undefined
          ? undefined
          : plainValue(filename),
  };
}

/** The header split at each `;` outside a quoted string. */
function splitParameters(value: string): string[] {
  const pieces: string[] = [];
  let quoted = false;
  let from = 0;
  for (let at = 0; at < value.length; at++) {
    const char = value[at];
    if (char === '"') quoted = !quoted;
    else if (char === ";" && !quoted) {
      pieces.push(value.slice(from, at));
      from = at + 1;
    }
  }
  if (quoted) throw malformed("leaves a quoted value open");
  pieces.push(value.slice(from));
  return pieces;
}

/* A token as it stands, or a quoted string with the HTML standard's escapes undone. */
function plainValue(raw: string): string {
  if (!raw.startsWith('"')) {
    if (!TOKEN.test(raw)) throw malformed("holds a value that is neither a token nor quoted");
    return raw;
  }
  if (raw.length < 2 || !raw.endsWith('"') || raw.slice(1, -1).includes('"')) {
    throw malformed("holds a quoted value that does not parse");
  }
  return raw
    .slice(1, -1)
    .replace(ESCAPED, (encoded) => UNESCAPED[encoded.slice(1).toLowerCase()] ?? encoded);
}

/* RFC 5987's charset'language'value, UTF-8 or ISO-8859-1 as its recipients must take. */
function extendedValue(raw: string): string {
  const match = /^([A-Za-z0-9!#$%&+\-^_`{}~]+)'[A-Za-z0-9-]*'(.*)$/.exec(raw);
  const charset = match?.[1]?.toLowerCase();
  if (match === null || (charset !== "utf-8" && charset !== "iso-8859-1")) {
    throw malformed("holds a filename* in a charset other than UTF-8 or ISO-8859-1");
  }
  const bytes: number[] = [];
  const encoded = match[2] ?? "";
  for (let at = 0; at < encoded.length; at++) {
    const char = encoded.charCodeAt(at);
    if (char !== 0x25) {
      if (char > 0x7e || char <= 0x20) throw malformed("holds a filename* that is not encoded");
      bytes.push(char);
      continue;
    }
    const hex = encoded.slice(at + 1, at + 3);
    if (!/^[0-9A-Fa-f]{2}$/.test(hex)) throw malformed("holds a filename* that is not encoded");
    bytes.push(Number.parseInt(hex, 16));
    at += 2;
  }
  try {
    return new TextDecoder(charset === "utf-8" ? "utf-8" : "latin1", { fatal: true }).decode(
      new Uint8Array(bytes),
    );
  } catch {
    throw malformed("holds a filename* that is not UTF-8");
  }
}

function malformed(reason: string): BodyError {
  return new BodyError("BODY_MALFORMED", `A part's Content-Disposition ${reason}`);
}
