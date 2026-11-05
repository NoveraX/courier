import { LIMITS } from "../limits";
import { boundaryOf } from "./boundary-of";
import type { FileStore } from "./file-store";
import { isOptionsPart, TextFields } from "./form-fields";
import { memoryStore } from "./memory-store";
import { type MultipartLimits, type MultipartPart, multipartParts } from "./multipart-parts";
import type { UploadHold } from "./upload-hold";

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
 * @param hold - The upload's part of what every upload keeps, its text fields taken from it
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
  hold?: UploadHold,
): Promise<ReadForm> {
  const form = new FormData();
  const fields = new TextFields(limits.maxFieldBytes, hold);
  let options: string | undefined;
  let first = true;
  for await (const part of multipartParts(body, boundary, limits)) {
    if (first && isOptionsPart(part)) options = await fields.read(part);
    else form.append(part.name, await partValue(part, fields, store));
    first = false;
  }
  return { options, form };
}

/** What a form read whole is held to beyond its size. */
export interface MultipartFormLimits {
  /** The most bytes its text fields may hold together */
  maxFieldBytes: number;
  /** The most parts — fields and files — it may hold; 1000 unless given */
  maxParts?: number | undefined;
}

/**
 * Read a `multipart/form-data` body into a form as a Courier server reads
 * one — every part a field or a file, a first `_options` field among them —
 * its files kept in memory, one copy each. The body is held to the limits
 * an upload through the proxy is: its part headers to 8 KB each, its parts
 * to `maxParts`, its text to `maxFieldBytes`.
 *
 * @param body - The body's bytes, held to its size and length
 * @param contentType - Its `Content-Type`, which names the boundary
 * @param limits - The most text and parts it may hold
 * @returns The form
 * @throws BodyError for a body that does not parse — the body cancelled
 *   when its type names no boundary — one past a limit, or one whose read failed
 *
 * @example
 * ```ts
 * const form = await readMultipartForm(body, contentType, { maxFieldBytes: 1_048_576 });
 * ```
 */
export async function readMultipartForm(
  body: ReadableStream<Uint8Array<ArrayBuffer>>,
  contentType: string,
  limits: MultipartFormLimits,
): Promise<FormData> {
  let boundary: string;
  try {
    boundary = boundaryOf(contentType);
  } catch (error) {
    await body.cancel();
    throw error;
  }
  const form = new FormData();
  const fields = new TextFields(limits.maxFieldBytes);
  const store = memoryStore(LIMITS.UPLOAD_SLAB_BYTES);
  const parts = multipartParts(body, boundary, {
    maxParts: limits.maxParts ?? LIMITS.MAX_UPLOAD_PARTS,
    maxHeaderBytes: LIMITS.MAX_PART_HEADER_BYTES,
  });
  for await (const part of parts) form.append(part.name, await partValue(part, fields, store));
  return form;
}

/* A part as a form holds it: a field's text, or a file `store` keeps. */
function partValue(
  part: MultipartPart,
  fields: TextFields,
  store: FileStore,
): Promise<string | File> {
  return part.filename === undefined ? fields.read(part) : store.file(part);
}
