import { isFieldRecord } from "../../utils/body-kind";
import { defineOwn } from "../../utils/define-own";
import { isRecord } from "../../utils/is-record";
import { RECORD_PART } from "../../utils/record-upload";
import { reviveWithoutPrototypeKeys } from "../../utils/safe-json";
import type { FilePlace } from "../../utils/variables-encoding";
import { BodyError } from "../body-error";
import { LIMITS } from "../limits";
import { boundaryOf } from "./boundary-of";
import type { FileStore } from "./file-store";
import { isOptionsPart, TextFields } from "./form-fields";
import { memoryStore } from "./memory-store";
import { multipartParts } from "./multipart-parts";
import type { FormLimits, MultipartFormLimits } from "./read-form";
import type { UploadHold } from "./upload-hold";

/** A record upload's record, read and checked: the record, and where each of its files goes, in the order they come. */
export interface RecordSlots {
  readonly variables: Record<string, unknown>;
  readonly places: readonly FilePlace[];
}

/**
 * The refusal of a body sent as a record upload that is not one.
 *
 * @param why - What is wrong with it, after "A record upload"
 * @returns The `BODY_MALFORMED` refusal
 * @example
 * ```ts
 * throw malformedRecord("holds no _variables part after its options");
 * ```
 */
export function malformedRecord(why: string): BodyError {
  return new BodyError("BODY_MALFORMED", `A record upload ${why}`);
}

/**
 * Read a record upload's `_variables` part: the record, `null` where each
 * file sat, and the places of its files. A place is a field of the record, or
 * an item of a list there, that holds `null`; the files come in the order the
 * record's fields, and the items of each list, give their places.
 *
 * The record is held to the parts an upload may hold as the form it goes as
 * would be: each field that holds a value, each item of a list and each file
 * is a part of that form, beside the parts before the record. A list of a
 * few hundred thousand empty strings, a few hundred kilobytes of text, went
 * on as as many parts.
 *
 * @param text - The part's text
 * @param maxParts - The most parts an upload may hold
 * @param before - The parts the upload holds before the record: its options
 * @returns The record, and its files' places in the order they come
 * @throws BodyError `BODY_MALFORMED` for text that is no such record, or a place it does not hold;
 *   `UPLOAD_TOO_MANY_PARTS` for a record whose form holds more parts than `maxParts` allows
 * @example
 * ```ts
 * recordOf('{"variables":{"title":"Dune","cover":null},"files":[["cover"]]}', 1000).places; // → [["cover"]]
 * ```
 */
export function recordOf(text: string, maxParts: number, before = 0): RecordSlots {
  let decoded: unknown;
  try {
    decoded = JSON.parse(text, reviveWithoutPrototypeKeys);
  } catch {
    throw malformedRecord("holds no JSON where its record goes");
  }
  const variables: unknown = isRecord(decoded) ? decoded.variables : undefined;
  const files: unknown = isRecord(decoded) ? decoded.files : undefined;
  if (!isFieldRecord(variables) || !Array.isArray(files)) {
    throw malformedRecord("names no record and no files");
  }
  const named = new Set(files.map(placeKey));
  if (named.size !== files.length) throw malformedRecord("names a file's place twice");
  const places: FilePlace[] = [];
  let parts = before;
  /* A value the form writes a part for: one that is not null, or a file at its place. */
  const take = (value: unknown, place: FilePlace): void => {
    const file = value === null && named.has(JSON.stringify(place));
    if (file) places.push(place);
    if (file || value !== null) parts += 1;
  };
  for (const [field, value] of Object.entries(variables)) {
    if (!Array.isArray(value)) take(value, [field]);
    else for (const [index, item] of value.entries()) take(item, [field, index]);
  }
  if (parts > maxParts) {
    throw new BodyError("UPLOAD_TOO_MANY_PARTS", `An upload holds more than ${maxParts} parts`);
  }
  if (places.length !== files.length)
    throw malformedRecord("names a place its record holds no file at");
  return { variables, places };
}

/* A place as a set of them keys it: a field, or a field and an item's index — nothing else. */
function placeKey(place: unknown): string {
  const [field, item, ...rest] = Array.isArray(place) ? place : [];
  const indexed = item === undefined || (Number.isSafeInteger(item) && Number(item) >= 0);
  if (typeof field !== "string" || !indexed || rest.length > 0) {
    throw malformedRecord(
      "names a file's place that is neither a field nor an item of a list there",
    );
  }
  return JSON.stringify(item === undefined ? [field] : [field, item]);
}

/**
 * Read a record upload into the record its call runs on, each file kept by
 * `store` at the place the record names for it.
 *
 * The call's options are the first part when it is named `_options`; the
 * record's part, `_variables`, comes next, read as a text field and held to
 * `maxFieldBytes` with the others; then one file for each place, in order,
 * named by its field. Anything else — no record, a file it has no place
 * for, a text field where a file goes, a file left out — refuses the upload.
 *
 * @param body - The upload's bytes, held to its size and length
 * @param boundary - Its boundary
 * @param limits - The most parts, header bytes and text it may hold
 * @param store - Where its files are kept
 * @param hold - The upload's part of what every upload keeps, its text taken from it
 * @returns The options, and the record
 * @throws BodyError `BODY_MALFORMED` for an upload that is no record upload; the parser's own refusal
 * @example
 * ```ts
 * const { options, variables } = await readRecord(body, boundary, limits, store, hold);
 * ```
 */
export async function readRecord(
  body: ReadableStream<Uint8Array<ArrayBuffer>>,
  boundary: string,
  limits: FormLimits,
  store: FileStore,
  hold?: UploadHold,
): Promise<{ options: string | undefined; variables: Record<string, unknown> }> {
  const fields = new TextFields(limits.maxFieldBytes, hold);
  let options: string | undefined;
  let record: RecordSlots | undefined;
  let filled = 0;
  let first = true;
  for await (const part of multipartParts(body, boundary, limits)) {
    if (first && isOptionsPart(part)) {
      options = await fields.read(part);
    } else if (record === undefined) {
      if (part.name !== RECORD_PART || part.filename !== undefined) {
        throw malformedRecord(`holds no ${RECORD_PART} part after its options`);
      }
      record = recordOf(await fields.read(part), limits.maxParts, options === undefined ? 0 : 1);
    } else {
      const place = record.places[filled];
      if (place === undefined || part.filename === undefined || part.name !== place[0]) {
        throw malformedRecord("holds a part where no file of its record goes");
      }
      put(record.variables, place, await store.file(part));
      filled += 1;
    }
    first = false;
  }
  if (record === undefined) throw malformedRecord(`holds no ${RECORD_PART} part after its options`);
  if (filled !== record.places.length) {
    throw malformedRecord("ended before the files its record names");
  }
  return { options, variables: record.variables };
}

/**
 * Read a record upload as a Courier server reads one — its options, then
 * the record, each file at its place — its files kept in memory, one copy
 * each, for a server of the proxy's protocol other than the proxy, as
 * Studio's mocks are. The body is held to the limits an upload through the
 * proxy is: its part headers to 8 KB each, its parts to `maxParts`, its text
 * — the record's part among it — to `maxFieldBytes`.
 *
 * @param body - The body's bytes, held to its size and length
 * @param contentType - Its `Content-Type`, which names the boundary
 * @param limits - The most text and parts it may hold
 * @returns The options, and the record
 * @throws BodyError for a body that is no record upload, one that does not parse —
 *   the body cancelled when its type names no boundary — one past a limit, or one whose read failed
 * @example
 * ```ts
 * const { options, variables } = await readRecordUpload(body, contentType, { maxFieldBytes: 1_048_576 });
 * ```
 */
export async function readRecordUpload(
  body: ReadableStream<Uint8Array<ArrayBuffer>>,
  contentType: string,
  limits: MultipartFormLimits,
): Promise<{ options: string | undefined; variables: Record<string, unknown> }> {
  let boundary: string;
  try {
    boundary = boundaryOf(contentType);
  } catch (error) {
    await body.cancel();
    throw error;
  }
  const formLimits: FormLimits = {
    maxParts: limits.maxParts ?? LIMITS.MAX_UPLOAD_PARTS,
    maxHeaderBytes: LIMITS.MAX_PART_HEADER_BYTES,
    maxFieldBytes: limits.maxFieldBytes,
  };
  return readRecord(body, boundary, formLimits, memoryStore(LIMITS.UPLOAD_SLAB_BYTES));
}

/* A file put back at its place: a field, or an item of the list there. */
function put(variables: Record<string, unknown>, [field, item]: FilePlace, file: File): void {
  if (item === undefined) {
    defineOwn(variables, field, file);
    return;
  }
  const list: unknown = variables[field];
  if (Array.isArray(list)) list[item] = file;
}
