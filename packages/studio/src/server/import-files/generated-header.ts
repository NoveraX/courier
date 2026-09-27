import { createLogger } from "@noverax/courier";
import { isRecord } from "../mocks-edit/is-record";
import { bodyHash } from "./body-hash";

const log = createLogger("Studio");

const MARK = "// @courier-generated ";
const NOTE =
  "// Courier Studio wrote this file. It keeps your edits to endpoints when it updates the file.";
const HEX_64 = /^[0-9a-f]{64}$/;

/** What a generated file's first line says about it. */
export interface GeneratedHeader {
  /** The import Studio wrote the file for. */
  import: string;
  /** The SHA-256 of the body Studio wrote under the header. */
  sha256: string;
}

/** A file's content, split into its generated header, if any, and its body. */
export interface ReadGeneratedFile {
  header: GeneratedHeader | null;
  body: string;
}

/**
 * Put Studio's header on a generated file: the import it belongs to and the
 * hash of the body below, then a line saying what the header is for. The
 * header lets Studio tell its own files, and whether they were edited,
 * where it has no record of writing them — in a fresh clone, say.
 *
 * @param importName - The import the file belongs to
 * @param body - The file's content, without a header
 * @returns The content to write
 * @example
 * ```ts
 * writeFile(path, signGeneratedFile("pets", generated.content));
 * ```
 */
export function signGeneratedFile(importName: string, body: string): string {
  /* JSON leaves the line and paragraph separators as they are, and either one ends a line comment. */
  const header = JSON.stringify({ import: importName, sha256: bodyHash(body) })
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
  return `${MARK}${header}\n${NOTE}\n${body}`;
}

/**
 * Split a file into Studio's header and its body. A file whose first line
 * is not a well-formed header has none, and all of it is body; the note
 * line below a header is dropped with it.
 *
 * @param content - The file's content as read
 * @returns The header, or `null`, and the body
 * @example
 * ```ts
 * const { header, body } = readGeneratedFile(text);
 * const untouched = header !== null && header.sha256 === bodyHash(body);
 * ```
 */
export function readGeneratedFile(content: string): ReadGeneratedFile {
  const firstEnd = content.indexOf("\n");
  const first = (firstEnd === -1 ? content : content.slice(0, firstEnd)).replace(/\r$/, "");
  const header = first.startsWith(MARK) ? parseHeader(first.slice(MARK.length)) : null;
  if (header === null) return { header: null, body: content };
  const rest = firstEnd === -1 ? "" : content.slice(firstEnd + 1);
  const noteEnd = rest.indexOf("\n");
  const second = (noteEnd === -1 ? rest : rest.slice(0, noteEnd)).replace(/\r$/, "");
  const body = second === NOTE ? (noteEnd === -1 ? "" : rest.slice(noteEnd + 1)) : rest;
  return { header, body };
}

function parseHeader(json: string): GeneratedHeader | null {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch (error) {
    log.debug(
      "A first line that starts like Studio's header holds no JSON; the file has no header",
      error,
    );
    return null;
  }
  if (!isRecord(value)) return null;
  const { import: importName, sha256 } = value;
  if (typeof importName !== "string" || typeof sha256 !== "string" || !HEX_64.test(sha256)) {
    return null;
  }
  return { import: importName, sha256 };
}
