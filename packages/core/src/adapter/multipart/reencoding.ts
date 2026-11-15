import { partHead, toCrlf } from "../../utils/multipart-framing";
import type { StreamedUploadSource } from "../../utils/streamed-upload";
import type { UploadSending } from "../../utils/upload-sending";
import { atDeadline, type BodyDeadline, overdueBody } from "../read-chunk";
import type { MultipartParts } from "./multipart-parts";
import { DEFAULT_PART_TYPE } from "./part-headers";

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

/**
 * What hands out a re-encoded upload, one piece each time the upstream asks
 * for one, and says when the last has gone.
 *
 * While the upstream is asked for nothing — before it asks for the first
 * piece, and while it has not taken the last one handed to it — no read of
 * the client's body is waiting, and its limits hold nothing. The body's
 * deadline holds the upload then: still being sent at it, the upload is
 * refused as overdue, the rest of the body taken off the connection, and
 * `refused` stops the request sending it, which nothing else would.
 */
export class Reencoding implements StreamedUploadSource, UploadSending {
  readonly contentType: string;
  readonly #boundary: string;
  readonly #outgoing: AsyncIterator<OutgoingPart>;
  readonly #parts: MultipartParts;
  readonly #due: BodyDeadline;
  readonly #encoder = new TextEncoder();
  readonly #refusal = new AbortController();
  readonly refused: AbortSignal = this.#refusal.signal;
  /* The file whose bytes are being sent. */
  #file: ReadableStreamDefaultReader<Uint8Array<ArrayBuffer>> | undefined;
  /* The line break that ends a file's bytes, sent with whatever follows them. */
  #lead = "";
  #ended = false;
  #stopped = false;
  #sentWhole = false;
  /* Runs out at the body's deadline while the upstream is asked for nothing. */
  #waiting: ReturnType<typeof setTimeout> | undefined;
  #endWith: (whole: boolean) => void = () => {};
  readonly ended: Promise<boolean> = new Promise((resolve) => {
    this.#endWith = resolve;
  });

  constructor(
    boundary: string,
    outgoing: AsyncIterator<OutgoingPart>,
    parts: MultipartParts,
    due: BodyDeadline,
  ) {
    this.contentType = `multipart/form-data; boundary=${boundary}`;
    this.#boundary = boundary;
    this.#outgoing = outgoing;
    this.#parts = parts;
    this.#due = due;
    this.#waitForUpstream();
  }

  async pull(controller: ReadableStreamDefaultController<Uint8Array<ArrayBuffer>>): Promise<void> {
    clearTimeout(this.#waiting);
    if (this.#stopped) throw new Error("The upload was stopped before it was sent whole");
    try {
      controller.enqueue(await this.#piece());
    } catch (error) {
      await this.stop();
      throw error;
    }
    if (!this.#ended) {
      this.#waitForUpstream();
      return;
    }
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
    clearTimeout(this.#waiting);
    this.#endWith(false);
    await this.#parts.return();
  }

  #waitForUpstream(): void {
    if (this.#stopped) return;
    this.#waiting = atDeadline(this.#due, () => {
      this.#refusal.abort(overdueBody(this.#due.timeoutMs));
      /* Taken off as far as it can be: the refusal is what the request fails with. */
      this.stop().catch(() => undefined);
    });
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
