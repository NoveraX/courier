import { RECORD_PART } from "../../utils/record-upload";
import { type FilePlace, formEntries } from "../../utils/variables-encoding";
import { isOptionsPart, TextFields } from "./form-fields";
import { type MultipartParts, multipartParts } from "./multipart-parts";
import type { FormLimits } from "./read-form";
import { malformedRecord, type RecordSlots, recordOf } from "./read-record";
import { type OutgoingPart, type StreamedForm, sending } from "./streamed-form";

/**
 * Read a record upload's options and record, and hand on the form the record
 * goes as — its fields written as a direct call writes them, each file passed
 * through as it arrives, none of it kept — as a multipart body of the proxy's
 * own, for the upstream to read as it is sent.
 *
 * @param body - The upload's bytes, held to its size and length
 * @param boundary - Its boundary
 * @param limits - The most parts, header bytes and text it may hold
 * @param defaults - The fields written ahead of the record's own: its source's `defaultBody`
 * @returns The options, the upload and what stops it
 * @throws BodyError `BODY_MALFORMED` for an upload whose record does not parse; a part out of
 *   place fails the upload as it is sent
 * @example
 * ```ts
 * const { options, upload, stop } = await streamedRecord(body, boundary, limits);
 * ```
 */
export async function streamedRecord(
  body: ReadableStream<Uint8Array<ArrayBuffer>>,
  boundary: string,
  limits: FormLimits,
  defaults: Readonly<Record<string, unknown>> = {},
): Promise<StreamedForm> {
  const parts = multipartParts(body, boundary, limits);
  const fields = new TextFields(limits.maxFieldBytes);
  let options: string | undefined;
  let record: RecordSlots;
  try {
    let next = await parts.next();
    if (!next.done && isOptionsPart(next.value)) {
      options = await fields.read(next.value);
      next = await parts.next();
    }
    if (next.done || next.value.name !== RECORD_PART || next.value.filename !== undefined) {
      throw malformedRecord(`holds no ${RECORD_PART} part after its options`);
    }
    record = recordOf(
      await fields.read(next.value),
      limits.maxParts,
      options === undefined ? 0 : 1,
    );
  } catch (error) {
    await parts.return();
    throw error;
  }
  return sending(options, recordParts(record, parts, defaults), parts);
}

/* The parts of the form a record goes as: its fields' text, and at each place the file the body
   brings there; the defaults under them first, as a direct call merges its source's defaultBody. */
async function* recordParts(
  record: RecordSlots,
  parts: MultipartParts,
  defaults: Readonly<Record<string, unknown>>,
): AsyncGenerator<OutgoingPart, void, undefined> {
  const places = new Set(record.places.map((place) => JSON.stringify(place)));
  const fileAt = (value: unknown, at: FilePlace): FilePlace | undefined =>
    value === null && places.has(JSON.stringify(at)) ? at : undefined;
  for (const { name, value } of formEntries({ ...defaults, ...record.variables }, fileAt)) {
    if (typeof value === "string") {
      yield { name, text: value };
      continue;
    }
    const next = await parts.next();
    if (next.done || next.value.filename === undefined || next.value.name !== name) {
      throw malformedRecord("holds a part where no file of its record goes");
    }
    yield { name, filename: next.value.filename, type: next.value.type, body: next.value.body };
  }
  if (!(await parts.next()).done)
    throw malformedRecord("holds a part where no file of its record goes");
}
