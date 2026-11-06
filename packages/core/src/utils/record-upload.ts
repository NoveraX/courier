/**
 * How a proxy call carries a record of variables that holds a file: as a
 * multipart body of a media type of its own, so a proxy that does not know
 * the format refuses it with 415 rather than reading it as a form, and a form
 * a page sends is never taken for one.
 *
 * Its first part is the call's options, as in a form; the second,
 * `_variables`, the record as JSON, `null` where each file sat, with the
 * places of its files; then each file, in the order the record's fields give
 * them, named by its field. The proxy restores the record from them, and the
 * call runs on it as a direct call runs on the record it was given.
 */

import { encodeMultipart } from "./multipart-body";
import { type FilePlace, formEntries, isFile } from "./variables-encoding";

/** The media type of a proxy call's record that holds a file. */
export const RECORD_UPLOAD_TYPE = "multipart/vnd.courier.variables";

/** The part, after the options, that holds the record. */
export const RECORD_PART = "_variables";

/** What the record's part says: the record, `null` where each file sat, and where each file goes. */
export interface RecordText {
  readonly variables: Record<string, unknown>;
  readonly files: readonly FilePlace[];
}

/**
 * The body a proxy call sends for a record that holds a file.
 *
 * @param record - The call's variables
 * @param options - The call's options the server may act on
 * @returns The body, and its content type, which names its boundary
 * @throws ConfigurationError `VARIABLE_NOT_ENCODABLE` for a value no form carries
 * @example
 * ```ts
 * const { body, contentType } = recordUpload({ title: "Dune", cover }, {});
 * ```
 */
export function recordUpload(
  record: Record<string, unknown>,
  options: Record<string, unknown>,
): { body: Blob; contentType: string } {
  const files = formEntries(record).filter((entry) => typeof entry.value !== "string");
  const text: RecordText = { variables: withoutFiles(record), files: files.map(({ at }) => at) };
  const form = new FormData();
  form.append("_options", JSON.stringify(options));
  form.append(RECORD_PART, JSON.stringify(text));
  for (const { name, value } of files) form.append(name, value);
  const { blob, contentType } = encodeMultipart(form, RECORD_UPLOAD_TYPE);
  return { body: blob, contentType };
}

/* The record with `null` where a form takes a file: in a field, or an item of a list there. */
function withoutFiles(record: Record<string, unknown>): Record<string, unknown> {
  const nullForFile = (value: unknown): unknown => (isFile(value) ? null : value);
  return Object.fromEntries(
    Object.entries(record).map(([name, value]) => [
      name,
      Array.isArray(value) ? value.map(nullForFile) : nullForFile(value),
    ]),
  );
}
