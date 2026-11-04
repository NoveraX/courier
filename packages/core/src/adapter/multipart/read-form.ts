import { BodyError } from "../body-error";
import type { FileStore } from "./file-store";
import { type MultipartLimits, type MultipartPart, multipartParts } from "./multipart-parts";

/** What an upload is held to beyond its size. */
export interface FormLimits extends MultipartLimits {
  /** The most bytes its text fields may hold together */
  maxFieldBytes: number;
}

/** An upload, read: the call's options, and the caller's own form. */
export interface ReadForm {
  /** The text of the first part, when it is the options field the client writes first */
  options: string | undefined;
  form: FormData;
}

/** The field the proxy client writes before the caller's, holding the call's options. */
const OPTIONS_FIELD = "_options";

/**
 * Read an upload into the caller's form, its files kept by `store`.
 *
 * The call's options are the first part when it is named `_options`, which
 * is where the client writes them; a field of that name anywhere else is
 * the caller's own and reaches the upstream with the rest. A text field is
 * read as UTF-8, its byte order mark kept, as the platform's own parser
 * reads one, and all of them together are held to `maxFieldBytes`: text is
 * held as text, never on disk, whatever `store` does with files.
 *
 * @param body - The upload's bytes, held to its size and length
 * @param boundary - Its boundary
 * @param limits - The most parts, header bytes and text it may hold
 * @param store - Where its files are kept
 * @returns The options and the form
 * @throws BodyError for a body that does not parse, one past a limit, or
 *   one whose read failed; `BODY_MALFORMED` for options sent as a file
 *
 * @example
 * ```ts
 * const { options, form } = await readForm(body, boundary, limits, memoryStore(65_536));
 * ```
 */
export async function readForm(
  body: ReadableStream<Uint8Array<ArrayBuffer>>,
  boundary: string,
  limits: FormLimits,
  store: FileStore,
): Promise<ReadForm> {
  const form = new FormData();
  let options: string | undefined;
  let fieldBytes = 0;
  let first = true;
  for await (const part of multipartParts(body, boundary, limits)) {
    const isOptions = first && part.name === OPTIONS_FIELD;
    first = false;
    if (part.filename !== undefined) {
      if (isOptions) throw new BodyError("BODY_MALFORMED", "options must be a JSON string");
      form.append(part.name, await store.file(part));
      continue;
    }
    const field = await fieldText(part, limits.maxFieldBytes - fieldBytes, limits.maxFieldBytes);
    fieldBytes += field.bytes;
    if (isOptions) options = field.text;
    else form.append(part.name, field.text);
  }
  return { options, form };
}

async function fieldText(
  part: MultipartPart,
  room: number,
  limit: number,
): Promise<{ text: string; bytes: number }> {
  const decoder = new TextDecoder("utf-8", { ignoreBOM: true });
  let text = "";
  let bytes = 0;
  for await (const piece of part.body) {
    bytes += piece.byteLength;
    if (bytes > room) {
      throw new BodyError(
        "UPLOAD_FIELDS_TOO_LARGE",
        `An upload's text fields exceed ${limit} bytes`,
      );
    }
    text += decoder.decode(piece, { stream: true });
  }
  return { text: text + decoder.decode(), bytes };
}
