import { BodyError } from "../body-error";
import { MultipartReader } from "./multipart-reader";
import { type PartHeaders, parsePartHeaders } from "./part-headers";

/** One part of a multipart body, as it arrives. */
export interface MultipartPart extends PartHeaders {
  /**
   * The part's bytes, as they arrive. Read it to its end, or cancel it,
   * before asking for the next part; the next part passes over what is left.
   */
  readonly body: ReadableStream<Uint8Array<ArrayBuffer>>;
}

/** What a multipart body is held to beyond its size. */
export interface MultipartLimits {
  /** The most parts — fields and files — the body may hold */
  maxParts: number;
  /** The most bytes a part's header lines may take */
  maxHeaderBytes: number;
}

/** Where the part a reader was given stands. */
interface PartState {
  ended: boolean;
  passedOver: boolean;
  reading: Promise<void> | undefined;
}

/**
 * The parts of a `multipart/form-data` body (RFC 7578), each handed on as
 * soon as its headers have arrived, its bytes streamed after them.
 *
 * Nothing is held but the part being read: a part's bytes pass through as
 * they come, and the body is read only as fast as they are taken, so the
 * client's upload slows to the pace of whatever takes them. Leaving the
 * loop early, or failing, takes the rest of the body off the connection.
 *
 * @param body - The body's bytes, held to its size and length
 * @param boundary - Its boundary, from its `Content-Type`
 * @param limits - The most parts it may hold, and their headers' size
 * @returns The parts, in order
 * @throws BodyError — while iterating — `BODY_MALFORMED` for a body that
 *   does not parse, `UPLOAD_TOO_MANY_PARTS` past `maxParts`, and the body's
 *   own refusal when it fails
 *
 * @example
 * ```ts
 * for await (const part of multipartParts(stream, boundaryOf(contentType), limits)) {
 *   part.filename === undefined ? await new Response(part.body).text() : await store(part);
 * }
 * ```
 */
export function multipartParts(
  body: ReadableStream<Uint8Array<ArrayBuffer>>,
  boundary: string,
  limits: MultipartLimits,
): AsyncIterableIterator<MultipartPart> {
  return new Parts(new MultipartReader(body, boundary, limits.maxHeaderBytes), limits.maxParts);
}

class Parts implements AsyncIterableIterator<MultipartPart> {
  readonly #reader: MultipartReader;
  readonly #maxParts: number;
  #count = 0;
  #current: PartState | undefined;
  #finished = false;

  constructor(reader: MultipartReader, maxParts: number) {
    this.#reader = reader;
    this.#maxParts = maxParts;
  }

  [Symbol.asyncIterator](): AsyncIterableIterator<MultipartPart> {
    return this;
  }

  async next(): Promise<IteratorResult<MultipartPart>> {
    if (this.#finished) return { done: true, value: undefined };
    try {
      if (this.#current === undefined) await this.#reader.skipPreamble();
      else await this.#passOver(this.#current);
      if (await this.#reader.closes()) {
        await this.#reader.epilogue();
        this.#finished = true;
        return { done: true, value: undefined };
      }
      this.#count += 1;
      if (this.#count > this.#maxParts) {
        throw new BodyError(
          "UPLOAD_TOO_MANY_PARTS",
          `An upload holds more than ${this.#maxParts} parts`,
        );
      }
      const headers = parsePartHeaders(await this.#reader.headerBlock());
      return { done: false, value: this.#open(headers) };
    } catch (error) {
      this.#finished = true;
      await this.#reader.cancel(error);
      throw error;
    }
  }

  async return(): Promise<IteratorResult<MultipartPart>> {
    if (!this.#finished) {
      this.#finished = true;
      await this.#reader.cancel();
    }
    return { done: true, value: undefined };
  }

  #open(headers: PartHeaders): MultipartPart {
    const state: PartState = { ended: false, passedOver: false, reading: undefined };
    this.#current = state;
    const body = new ReadableStream<Uint8Array<ArrayBuffer>>(
      {
        pull: (controller) => {
          if (state.passedOver) {
            throw new Error("A part's body was read after the next part was asked for");
          }
          state.reading = this.#reader.data().then((piece) => {
            if (piece !== undefined) return controller.enqueue(piece);
            state.ended = true;
            controller.close();
          });
          return state.reading;
        },
      },
      { highWaterMark: 0 },
    );
    return { ...headers, body };
  }

  /* What the reader left of a part is read here, and dropped. */
  async #passOver(state: PartState): Promise<void> {
    if (state.reading !== undefined) await state.reading;
    state.passedOver = true;
    while (!state.ended) state.ended = (await this.#reader.data()) === undefined;
  }
}
