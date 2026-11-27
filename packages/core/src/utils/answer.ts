import { type BodyForm, type BodyForms, readBody } from "./read-body";

/**
 * An answer as the platform's fetch handed it, and the one way its body is
 * read. Its `response` carries the status, the headers and the address the
 * server answered with; its body is read through `read`, which gives up
 * when the call stops waiting and rejects as the request itself would.
 */
export interface Answer {
  /** The answer as fetch, or the source's own fetch, handed it over */
  readonly response: Response;
  /**
   * Read the body whole, once: what the server sent, its text decoded as
   * UTF-8. Rejects with the call's cancellation once it stops waiting, with
   * its timeout once that runs out, and as a network failure when the body
   * stops arriving.
   */
  read<F extends BodyForm>(form: F): Promise<BodyForms[F]>;
}

/** What an answer's reads give up with, and what one that fails is thrown as. */
export interface AnswerReading {
  /** Fires when the call stops waiting, or its time runs out */
  signal?: AbortSignal | undefined;
  /** What a read that failed is thrown as: the request's own failure, as fetch's rejection is */
  failed?: ((error: unknown) => unknown) | undefined;
}

/**
 * An answer of the platform's, read through Courier's reader.
 *
 * @param response - The answer, its body unread
 * @param reading - The signal its reads give up with, and how a failed one is thrown
 * @returns The answer
 * @example
 * ```ts
 * const answer = platformAnswer(await fetch(url, { signal }), { signal });
 * const text = await answer.read("text");
 * ```
 */
export function platformAnswer(response: Response, reading: AnswerReading = {}): Answer {
  const { signal, failed } = reading;
  return {
    response,
    read: (form) =>
      readBody(response, form, { signal }).catch((error: unknown) => {
        throw failed ? failed(error) : error;
      }),
  };
}
