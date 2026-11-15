import { multipartBoundary } from "../../utils/multipart-framing";
import { type StreamedUpload, streamedUpload } from "../../utils/streamed-upload";
import { trackSending } from "../../utils/upload-sending";
import type { BodyDeadline } from "../read-chunk";
import { isOptionsPart, TextFields } from "./form-fields";
import { type MultipartPart, type MultipartParts, multipartParts } from "./multipart-parts";
import type { FormLimits } from "./read-form";
import { type OutgoingPart, Reencoding } from "./reencoding";

/** An upload being sent on: the call's options, the upload itself, and what stops it. */
export interface StreamedForm {
  /** The text of the first part, when it is the options field the client writes first */
  options: string | undefined;
  /** The caller's fields and files, re-encoded as they are read */
  upload: StreamedUpload;
  /**
   * Stop reading the upload wherever it stands, the rest of the body taken
   * off the connection unread; an upload still being sent then fails.
   */
  stop(): Promise<void>;
}

/**
 * Read an upload's options, and hand on the rest of it as a multipart body
 * of the proxy's own, re-encoded part by part as the upstream reads it.
 *
 * The options are the first part when it is the `_options` field, as
 * `readForm` reads them, and are read before this returns: the call needs
 * them before the first file arrives. Every other part reaches the upstream
 * as `readForm` and then `encodeMultipart` would have sent it — under a
 * boundary of the proxy's own, with its name, filename and type alone, a
 * text field's line breaks made CRLF — so the upstream parses what the
 * proxy parsed, whatever else the client's bytes held. A file's bytes pass
 * through as they arrive, none kept, and the client's body is read only as
 * fast as the upstream takes them; a text field is read whole, the upload's
 * text held together to `maxFieldBytes`.
 *
 * A body that fails, breaks a limit or does not parse fails the upload with
 * its refusal, a `BodyError`, which the call's failure then carries as its
 * cause. The closing delimiter is sent only once the body has ended whole:
 * the upstream never takes a body cut short for a complete one.
 *
 * @param body - The upload's bytes, held to its size and length
 * @param boundary - Its boundary
 * @param limits - The most parts, header bytes and text it may hold
 * @param due - By when the whole body must have arrived, which holds it while the upstream takes none of it
 * @returns The options, the upload and what stops it
 * @throws BodyError for a first part that does not parse, breaks a limit or
 *   fails; `BODY_MALFORMED` for options sent as a file
 *
 * @example
 * ```ts
 * const { options, upload, stop } = await streamedForm(body, boundary, limits, due);
 * try {
 *   await fetch(url, { method: "POST", body: upload, duplex: "half", headers: { "content-type": upload.type } });
 * } finally {
 *   await stop();
 * }
 * ```
 */
export async function streamedForm(
  body: ReadableStream<Uint8Array<ArrayBuffer>>,
  boundary: string,
  limits: FormLimits,
  due: BodyDeadline,
): Promise<StreamedForm> {
  const parts = multipartParts(body, boundary, limits);
  const fields = new TextFields(limits.maxFieldBytes);
  let options: string | undefined;
  let first: MultipartPart | undefined;
  try {
    const next = await parts.next();
    if (!next.done && isOptionsPart(next.value)) options = await fields.read(next.value);
    else if (!next.done) first = next.value;
  } catch (error) {
    await parts.return();
    throw error;
  }
  return sending(options, formParts(first, parts, fields), parts, due);
}

/* A form's parts as they come: a field read whole, a file passed through. */
async function* formParts(
  first: MultipartPart | undefined,
  parts: MultipartParts,
  fields: TextFields,
): AsyncGenerator<OutgoingPart, void, undefined> {
  let part = first;
  while (true) {
    if (part === undefined) {
      const next = await parts.next();
      if (next.done) return;
      part = next.value;
    }
    yield part.filename === undefined
      ? { name: part.name, text: await fields.read(part) }
      : { name: part.name, filename: part.filename, type: part.type, body: part.body };
    part = undefined;
  }
}

/**
 * An upload sent on as the parts `outgoing` gives, re-encoded under a
 * boundary of the proxy's own, and what stops it: stopping takes the rest of
 * the body off the connection unread.
 *
 * @param options - The call's options, read before
 * @param outgoing - The parts to send, in order, read from `parts` as they are asked for
 * @param parts - The body's parts, whose reading stopping ends
 * @param due - By when the whole body must have arrived
 * @returns The streamed upload
 * @example
 * ```ts
 * return sending(options, formParts(first, parts, fields), parts, due);
 * ```
 */
export function sending(
  options: string | undefined,
  outgoing: AsyncIterator<OutgoingPart>,
  parts: MultipartParts,
  due: BodyDeadline,
): StreamedForm {
  const encoding = new Reencoding(multipartBoundary(), outgoing, parts, due);
  const upload = streamedUpload(encoding.contentType, encoding);
  trackSending(upload, encoding);
  return { options, upload, stop: () => encoding.stop() };
}
