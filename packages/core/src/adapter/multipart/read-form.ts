import type { FileStore } from "./file-store";
import { isOptionsPart, TextFields } from "./form-fields";
import { type MultipartLimits, multipartParts } from "./multipart-parts";

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
  const fields = new TextFields(limits.maxFieldBytes);
  let options: string | undefined;
  let first = true;
  for await (const part of multipartParts(body, boundary, limits)) {
    if (first && isOptionsPart(part)) options = await fields.read(part);
    else if (part.filename !== undefined) form.append(part.name, await store.file(part));
    else form.append(part.name, await fields.read(part));
    first = false;
  }
  return { options, form };
}
