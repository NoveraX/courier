import type { DownloadProgress } from "../http-client/types";
import type { CallProgress } from "./call-progress";
import { type BodyCounter, type BodyForm, type BodyForms, readBody } from "./read-body";
import { assertStreamedAnswer } from "./streamed-answer";
import { withoutProgress } from "./without-progress";

/**
 * An answer as the platform's fetch handed it, and the one way its body is
 * read. Its `response` carries the status, the headers and the address the
 * server answered with; its body is read through `read`, which gives up
 * when the call stops waiting and rejects as the request itself would, or
 * handed over unread through `stream`.
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
  /**
   * The body as it arrives, for a call that reads it itself, in place of
   * `read`: counted as it is read when the call reports its download, a
   * stream of the global class then, read with the body's own reader.
   * `null` for an answer that has none. Throws a `ConfigurationError`
   * `RESPONSE_STREAM_UNAVAILABLE` for one handed over whole, by a fetch
   * that sends with React Native's own.
   */
  stream(): ReadableStream<Uint8Array> | null;
}

/** What an answer's reads give up with, what counts them, and what one that fails is thrown as. */
export interface AnswerReading {
  /** Fires when the call stops waiting, or its time runs out */
  signal?: AbortSignal | undefined;
  /** What a read that failed is thrown as: the request's own failure, as fetch's rejection is */
  failed?: ((error: unknown) => unknown) | undefined;
  /** Counts the body as it is read, for a call that reports its download and nothing else counts */
  counter?: BodyCounter | undefined;
}

/**
 * An answer of the platform's, read through Courier's reader: a read that
 * fails fails as `failed` makes of it, as the request's own failure does.
 *
 * @param response - The answer, its body unread
 * @param reading - The signal its reads give up with, what counts them, and how a failed one is thrown
 * @returns The answer
 * @example
 * ```ts
 * const answer = platformAnswer(await fetch(url, { signal }), { signal });
 * const text = await answer.read("text");
 * ```
 */
export function platformAnswer(response: Response, reading: AnswerReading = {}): Answer {
  const { signal, failed, counter } = reading;
  return {
    response,
    read: (form) =>
      readBody(response, form, { signal, counter }).catch((error: unknown) => {
        throw failed ? failed(error) : error;
      }),
    stream: () => {
      assertStreamedAnswer(response);
      /* The polyfill's answer has no `body` at all; a status that has no body, a null one. */
      const body: ReadableStream<Uint8Array> | null | undefined = response.body;
      if (body == null) return null;
      return counter ? counter(body, response.headers) : body;
    },
  };
}

/**
 * Load what counts a call's download as its answer is read, alongside the
 * request: a page that never reports one never loads it. Progress betters a
 * call and never decides it — one whose counter did not load reads its
 * answer uncounted, said once.
 *
 * @param onProgress - Who hears the body come in
 * @param kept - The call's progress, which keeps what `onProgress` throws
 * @returns The counter, or nothing when it did not load
 * @example
 * ```ts
 * const counting = loadCounter((progress) => bar.set(progress.percent));
 * const answer = platformAnswer(await fetch(url), { counter: await counting });
 * ```
 */
export function loadCounter(
  onProgress: (progress: DownloadProgress) => void,
  kept?: CallProgress,
): Promise<BodyCounter | undefined> {
  return import("./progress").then(
    ({ downloadCounter }) => downloadCounter(onProgress, kept),
    withoutProgress,
  );
}
