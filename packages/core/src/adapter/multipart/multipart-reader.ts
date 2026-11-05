import { BodyError } from "../body-error";
import { DelimiterSearch } from "./delimiter-search";

const CR = 0x0d;
const LF = 0x0a;
const DASH = 0x2d;
const EMPTY = new Uint8Array(0);

/**
 * A multipart body's bytes, read a phase at a time as the chunks arrive: the
 * preamble, the line each delimiter ends, a part's headers, its data, the
 * epilogue (RFC 2046 §5.1.1).
 *
 * A part's data is handed out as views of the chunks it came in; only a
 * part's headers are copied, into one buffer of their limit's size that each
 * part reuses. Nothing is read before it is asked for, so whoever reads the
 * data sets the pace of the upload.
 */
export class MultipartReader {
  readonly #source: ReadableStreamDefaultReader<Uint8Array<ArrayBuffer>>;
  readonly #search: DelimiterSearch;
  readonly #headers: Uint8Array<ArrayBuffer>;
  readonly #pending: Uint8Array<ArrayBuffer>[] = [];
  readonly #take = (piece: Uint8Array<ArrayBuffer>): void => {
    this.#pending.push(piece);
  };
  #chunk: Uint8Array<ArrayBuffer> = EMPTY;
  #at = 0;
  #partEnded = true;
  /* The body has ended, or failed: there is nothing left of it to cancel. */
  #over = false;

  /**
   * @param body - The body's bytes
   * @param boundary - Its boundary
   * @param maxHeaderBytes - The most a part's header lines may take
   */
  constructor(
    body: ReadableStream<Uint8Array<ArrayBuffer>>,
    boundary: string,
    maxHeaderBytes: number,
  ) {
    this.#source = body.getReader();
    this.#search = new DelimiterSearch(boundary, true);
    this.#headers = new Uint8Array(maxHeaderBytes + 4);
  }

  /** Pass over everything before the first delimiter. */
  async skipPreamble(): Promise<void> {
    this.#partEnded = false;
    while ((await this.data()) !== undefined) this.#pending.length = 0;
  }

  /**
   * Read the rest of a delimiter's line: `--` closes the body; otherwise the
   * line ends, after any spaces or tabs a transport added, with CRLF and a
   * part follows.
   *
   * @returns Whether the delimiter closed the body
   * @throws BodyError `BODY_MALFORMED` for anything else
   */
  async closes(): Promise<boolean> {
    let byte = await this.#byte();
    if (byte === DASH) {
      if ((await this.#byte()) === DASH) return true;
      throw malformed("a boundary is followed by text of its own");
    }
    for (let padding = 0; byte === 0x20 || byte === 0x09; padding++) {
      if (padding === this.#headers.length) throw malformed("a boundary's line does not end");
      byte = await this.#byte();
    }
    if (byte !== CR || (await this.#byte()) !== LF) {
      throw malformed("a boundary's line does not end with CRLF");
    }
    return false;
  }

  /**
   * A part's header lines, each with its CRLF, without the empty line that
   * ends them. The view is valid until the next part's are read.
   *
   * @throws BodyError `BODY_MALFORMED` for a line that ends in a bare line
   *   feed, `UPLOAD_PART_HEADERS_TOO_LARGE` past the limit
   */
  async headerBlock(): Promise<Uint8Array<ArrayBuffer>> {
    const block = this.#headers;
    let length = 0;
    for (;;) {
      if (this.#at >= this.#chunk.length && !(await this.#fill())) throw unterminated();
      const taken = Math.min(this.#chunk.length - this.#at, block.length - length);
      block.set(this.#chunk.subarray(this.#at, this.#at + taken), length);
      for (let at = length; at < length + taken; at++) {
        if (block[at] !== LF) continue;
        if (block[at - 1] !== CR) throw malformed("a header line ends with a bare line feed");
        /* The empty line: at the very start, or right after a header line's CRLF. */
        const end = at === 1 ? 0 : block[at - 2] === LF ? at - 1 : -1;
        if (end === -1) continue;
        this.#at += at + 1 - length;
        this.#partEnded = false;
        return block.subarray(0, end);
      }
      length += taken;
      this.#at += taken;
      if (length === block.length) {
        throw new BodyError(
          "UPLOAD_PART_HEADERS_TOO_LARGE",
          `A part's headers exceed ${block.length - 4} bytes`,
        );
      }
    }
  }

  /**
   * The next piece of the current part's data.
   *
   * @returns A view of the bytes, or `undefined` once the part has ended
   * @throws BodyError `BODY_MALFORMED` when the body ends before its closing
   *   delimiter; the body's own refusal when it fails
   */
  async data(): Promise<Uint8Array<ArrayBuffer> | undefined> {
    for (;;) {
      const piece = this.#pending.shift();
      if (piece !== undefined) return piece;
      if (this.#partEnded) return undefined;
      if (this.#at >= this.#chunk.length && !(await this.#fill())) throw unterminated();
      const end = this.#search.find(this.#chunk, this.#at, this.#take);
      this.#at = end === -1 ? this.#chunk.length : end;
      this.#partEnded = end !== -1;
    }
  }

  /** Read what follows the closing delimiter to the body's end, keeping none of it. */
  async epilogue(): Promise<void> {
    while (await this.#fill()) {}
  }

  /** Stop reading: the rest of the body is taken off the connection unread. */
  async cancel(reason?: unknown): Promise<void> {
    if (this.#over) return;
    this.#over = true;
    await this.#source.cancel(reason);
  }

  async #byte(): Promise<number> {
    while (this.#at >= this.#chunk.length) {
      if (!(await this.#fill())) throw unterminated();
    }
    return this.#chunk[this.#at++] ?? -1;
  }

  async #fill(): Promise<boolean> {
    let read: ReadableStreamReadResult<Uint8Array<ArrayBuffer>>;
    try {
      read = await this.#source.read();
    } catch (error) {
      this.#over = true;
      throw error;
    }
    this.#over ||= read.done;
    this.#chunk = read.done ? EMPTY : read.value;
    this.#at = 0;
    return !read.done;
  }
}

function unterminated(): BodyError {
  return malformed("the body ends before its closing boundary");
}

function malformed(reason: string): BodyError {
  return new BodyError("BODY_MALFORMED", `The multipart body does not parse: ${reason}`);
}
