import { ConfigurationError } from "../errors/configuration-error";
import { isRawBody } from "../utils/body-kind";
import { isFormData } from "../utils/helpers";
import { isStreamedUpload, type StreamedUpload } from "../utils/streamed-upload";
import { multipartForm } from "../utils/variables-encoding";

/**
 * Encode fields as a `multipart/form-data` body, a file among them or not,
 * each as a part as a direct call writes a record that holds a file: as
 * OpenAPI writes the media type by default.
 *
 * A field left `undefined` or `null` is not sent. A string, a number or a
 * boolean is a part of its text, a date of its ISO string, an object of its
 * JSON; a `Blob` or a `File` is a file, and bytes are a file of their own; a
 * list is a part for each item. A form already — a `FormData`, or the
 * upload a proxy sends on as it arrives with `uploadMode: "stream"` — is
 * returned as it is, so a closure that hands its variables on works in
 * every upload mode.
 *
 * @param fields - The fields, by name
 * @returns The body, which `fetch` sends with its multipart content type
 * @throws ConfigurationError `VARIABLE_NOT_ENCODABLE` for a value no part
 *   carries — a `Set`, a `Map`, a stream, a file deeper than a field or a
 *   list's item — naming where it sits, and for a list, a scalar or a body
 *   of its own given in place of the fields
 * @example
 * ```ts
 * const uploadCover = endpoint
 *   .variables<{ title: string; cover?: Blob }>()
 *   .via((http, fields) => http.post("covers", undefined, { body: multipartBody(fields) }));
 * // multipart/form-data, with a cover or without one
 * ```
 */
export function multipartBody<TForm extends FormData | StreamedUpload>(form: TForm): TForm;
export function multipartBody(fields: Record<string, unknown>): FormData;
export function multipartBody(fields: unknown): FormData | StreamedUpload {
  if (isFormData(fields) || isStreamedUpload(fields)) return fields;
  if (!holdsFields(fields)) {
    throw new ConfigurationError(
      "VARIABLE_NOT_ENCODABLE",
      "[courier] multipartBody writes named fields as a form; send a list, a scalar or a file in a field of a record",
    );
  }
  return multipartForm(fields);
}

/* Named fields: anything but a list, a scalar or a body of its own — the
   stand-in a closure is given while its endpoint is defined among them. */
function holdsFields(value: unknown): value is Record<string, unknown> {
  if (value === null || Array.isArray(value) || isRawBody(value)) return false;
  return typeof value === "object" || typeof value === "function";
}
