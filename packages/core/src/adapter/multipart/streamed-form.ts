import { multipartBoundary, partHead, toCrlf } from "../../utils/multipart-framing";
import {
  type StreamedUpload,
  type StreamedUploadSource,
  streamedUpload,
} from "../../utils/streamed-upload";
import { trackSending, type UploadSending } from "../../utils/upload-sending";
import { isOptionsPart, TextFields } from "./form-fields";
import { type MultipartPart, type MultipartParts, multipartParts } from "./multipart-parts";
import { DEFAULT_PART_TYPE } from "./part-headers";
import type { FormLimits } from "./read-form";

const CRLF = "\r\n";
/* The characters a File keeps of the type it is given: one holding any other has none (File API). */
const MEDIA_TYPE = /^[\x20-\x7e]*$/;

/** A part as the re-encoded upload sends it: a field's text, or a file's bytes as they arrive. */
export type OutgoingPart =
  | { readonly name: string; readonly text: string }
  | {
      readonly name: string;
      readonly filename: string;
      readonly type: string | undefined;
      readonly body: ReadableStream<Uint8Array<ArrayBuffer>>;
    };

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
 * @returns The options, the upload and what stops it
 * @throws BodyError for a first part that does not parse, breaks a limit or
 *   fails; `BODY_MALFORMED` for options sent as a file
 *
 * @example
 * ```ts
 * const { options, upload, stop } = await streamedForm(body, boundary, limits);
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
  return sending(options, formParts(first, parts, fields), parts);
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
 * @returns The streamed upload
 * @example
 * ```ts
 * return sending(options, formParts(first, parts, fields), parts);
 * ```
 */
export function sending(
  options: string | undefined,
  outgoing: AsyncIterator<OutgoingPart>,
  parts: MultipartParts,
): StreamedForm {
  const encoding = new Reencoding(multipartBoundary(), outgoing, parts);
  const upload = streamedUpload(encoding.contentType, encoding);
  trackSending(upload, encoding);
  return { options, upload, stop: () => encoding.stop() };
}

/* What hands out the re-encoded upload, one piece each time it is asked for one, and says when
   the last has gone. */
class Reencoding implements StreamedUploadSource, UploadSending {
  readonly contentType: string;
  readonly #boundary: string;
  readonly #outgoing: AsyncIterator<OutgoingPart>;
  readonly #parts: MultipartParts;
  readonly #encoder = new TextEncoder();
  /* The file whose bytes are being sent. */
  #file: ReadableStreamDefaultReader<Uint8Array<ArrayBuffer>> | undefined;
  /* The line break that ends a file's bytes, sent with whatever follows them. */
  #lead = "";
  #ended = false;
  #stopped = false;
  #sentWhole = false;
  #endWith: (whole: boolean) => void = () => {};
  readonly ended: Promise<boolean> = new Promise((resolve) => {
    this.#endWith = resolve;
  });

  constructor(boundary: string, outgoing: AsyncIterator<OutgoingPart>, parts: MultipartParts) {
    this.contentType = `multipart/form-data; boundary=${boundary}`;
    this.#boundary = boundary;
    this.#outgoing = outgoing;
    this.#parts = parts;
  }

  async pull(controller: ReadableStreamDefaultController<Uint8Array<ArrayBuffer>>): Promise<void> {
    if (this.#stopped) throw new Error("The upload was stopped before it was sent whole");
    try {
      controller.enqueue(await this.#piece());
    } catch (error) {
      await this.stop();
      throw error;
    }
    if (!this.#ended) return;
    controller.close();
    this.#sentWhole = true;
    this.#endWith(true);
  }

  cancel(): Promise<void> {
    return this.stop();
  }

  whole(): boolean {
    return this.#sentWhole;
  }

  async stop(): Promise<void> {
    if (this.#stopped) return;
    this.#stopped = true;
    this.#endWith(false);
    await this.#parts.return();
  }

  async #piece(): Promise<Uint8Array<ArrayBuffer>> {
    if (this.#file !== undefined) {
      const read = await this.#file.read();
      if (!read.done) return read.value;
      this.#file = undefined;
      this.#lead = CRLF;
    }
    const next = await this.#outgoing.next();
    if (next.done) {
      this.#ended = true;
      return this.#text(`--${this.#boundary}--${CRLF}`);
    }
    const part = next.value;
    if ("text" in part) {
      return this.#text(`${partHead(this.#boundary, part.name)}${toCrlf(part.text)}${CRLF}`);
    }
    this.#file = part.body.getReader();
    return this.#text(
      partHead(this.#boundary, part.name, { filename: part.filename, type: fileType(part.type) }),
    );
  }

  /* Text, after the line break that ends the file before it, if one does. */
  #text(text: string): Uint8Array<ArrayBuffer> {
    const bytes = this.#encoder.encode(this.#lead + text);
    this.#lead = "";
    return bytes;
  }
}

/* The type a File made of the part holds, as `readForm` keeps one: RFC 7578's default when it
   names none, lowercase, and none at all when it holds a character no media type does. */
function fileType(type: string | undefined): string {
  const named = type ?? DEFAULT_PART_TYPE;
  return MEDIA_TYPE.test(named) ? named.toLowerCase() : "";
}
