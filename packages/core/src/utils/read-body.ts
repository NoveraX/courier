import { abortReason } from "./abort-reason";
import { ONCE } from "./own";
import { responseTakesStreams } from "./response-takes-streams";

/** What an answer's body is read as, and what each form reads to. */
export interface BodyForms {
  text: string;
  arrayBuffer: ArrayBuffer;
  blob: Blob;
  formData: FormData;
}

export type BodyForm = keyof BodyForms;

/**
 * Makes the stream a call counts its answer's body through, against the
 * length the answer's headers declare.
 */
export type BodyCounter = (headers: Headers) => TransformStream<Uint8Array, Uint8Array>;

/** How a body is read. */
export interface BodyReading {
  /** Fires when the call stops waiting for the body, or its time runs out */
  signal?: AbortSignal | undefined;
  /** Counts the body, chunk by chunk, as it is read */
  counter?: BodyCounter | undefined;
}

/**
 * Read an answer's body whole as `form`, the way the platform reads it, and
 * give the read up once the call stops waiting. Where the platform's
 * `Response` takes a stream — in a browser, on a server — the body passes
 * through a stream the call's signal cuts, counted as it passes when the call
 * reports its download, and is read through a `Response` of the platform's:
 * a copy of a shared answer is no longer read once its call leaves, as fetch
 * no longer reads a cancelled request's body. Where it does not — React
 * Native's is the whatwg-fetch polyfill, which held the text `[object
 * ReadableStream]` when it was made of an Expo answer's stream, and React
 * Native has no streams at all without Expo — the answer reads itself, and
 * a call that stops waiting is given its reason at once while the copy it
 * left is read out unseen; there a download is counted by the
 * XMLHttpRequest that brought it.
 *
 * @param response - The answer, its body unread
 * @param form - What the body is read as
 * @param reading - The signal the read gives up with, and what counts it
 * @returns The body, in the form asked for
 * @example
 * ```ts
 * const text = await readBody(response, "text", { signal });
 * ```
 */
export function readBody<F extends BodyForm>(
  response: Response,
  form: F,
  { signal, counter }: BodyReading = {},
): Promise<BodyForms[F]> {
  if (signal?.aborted) return Promise.reject(abortReason(signal));
  const { body } = response;
  const passes = signal !== undefined || counter !== undefined;
  if (!passes || body == null || !responseTakesStreams()) {
    return untilLeft(response[form](), signal) as Promise<BodyForms[F]>;
  }
  const through = counter ? counter(response.headers) : new TransformStream();
  /* Options of no prototype, which the platform reads each member it does not find of. */
  const passed = body.pipeThrough(through, { __proto__: null, signal } as StreamPipeOptions);
  const init = { __proto__: null, headers: response.headers } as ResponseInit;
  return new Response(passed, init)[form]() as Promise<BodyForms[F]>;
}

/* The answer's own read, given up when the call stops waiting. */
function untilLeft(read: Promise<unknown>, signal: AbortSignal | undefined): Promise<unknown> {
  if (signal === undefined) return read;
  return new Promise((resolve, reject) => {
    const leave = (): void => reject(abortReason(signal));
    signal.addEventListener("abort", leave, ONCE);
    void read.then(resolve, reject).finally(() => signal.removeEventListener("abort", leave));
  });
}
