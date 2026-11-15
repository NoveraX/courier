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
 * the client's body is waiting, and its limits hold nothing. Two times hold
 * the wait then, and the first to run out stops the upload, the rest of the
 * body taken off the connection: the body's deadline, at which the upload is
 * refused as overdue and `refused` stops the request sending it, and the
 * time that request gives each wait (`holdWaits`), past which it is told it
 * ran out of time. Nothing else would stop it: no read of the body fails.
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
  /* Whether the upstream is asked for nothing now. */
  #idle = false;
  /* The time the request sending the upload gives each wait, and what it is told past it. */
  #allowed: { readonly ms: number; readonly expire: () => void } | undefined;
  /* Runs out while the upstream is asked for nothing, at the first of the times holding it. */
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
    if (this.#stopped) throw new Error("The upload was stopped before it was sent whole");
    this.#idle = false;
    clearTimeout(this.#waiting);
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

  holdWaits(ms: number, expire: () => void): void {
    this.#allowed = { ms, expire };
    /* A wait under way as the request begins is timed from then. */
    if (this.#idle) this.#timeWait();
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
    this.#idle = true;
    this.#timeWait();
  }

  /* One timer for the wait: at the body's deadline, or at the end of the request's time for the
     wait when that comes first. */
  #timeWait(): void {
    clearTimeout(this.#waiting);
    const allowed = this.#allowed;
    const until = allowed === undefined ? Number.POSITIVE_INFINITY : performance.now() + allowed.ms;
    const expire = until < this.#due.deadline ? allowed?.expire : undefined;
    this.#waiting = atDeadline(Math.min(until, this.#due.deadline), () => {
      if (expire) expire();
      else this.#refusal.abort(overdueBody(this.#due.timeoutMs));
      /* Taken off as far as it can be: the request fails with why it was stopped. */
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
