import { abortReason } from "./abort-reason";
import { ONCE } from "./own";
import { ownedBytes } from "./owned-bytes";
import { readChunks } from "./read-chunks";
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
 * What counts a call's download: an answer's body passed on as a stream of
 * the global class, counted against the length its headers declare as its
 * reader reads it.
 */
export type BodyCounter = (
  body: ReadableStream<Uint8Array>,
  headers: Headers,
) => ReadableStream<Uint8Array>;

/** How a body is read. */
export interface BodyReading {
  /** Fires when the call stops waiting for the body, or its time runs out */
  signal?: AbortSignal | undefined;
  /** Counts the body, chunk by chunk, as it is read */
  counter?: BodyCounter | undefined;
}

/* Decoded as it comes: a character may be split between two chunks. */
const IN_PARTS: TextDecodeOptions = { stream: true };

/**
 * Read an answer's body whole as `form`, as the platform reads it, and give
 * the read up once the call stops waiting. Where the platform's `Response`
 * is the fetch standard's — in a browser, on a server — the body is read
 * with its own reader, counted as it comes when the call reports its
 * download, and a call that stops waiting cancels it: a copy of a shared
 * answer is no longer read once its call leaves, as fetch no longer reads a
 * cancelled request's body. Its own reader is what every implementation of
 * web streams has alike: an answer of Node's fetch, its body Node's stream,
 * is read so where the global classes are another implementation's, as
 * Metro's polyfill under jest-expo, which a body piped through one of them
 * failed with a `TypeError`. Its text is decoded as UTF-8 as it comes, as
 * `Response.text()` decodes it, a byte order mark dropped; its bytes, a Blob
 * or a form are made by a `Response` of the platform's, of a Blob of what
 * came, as they would have been made of the body.
 *
 * Where it is not — React Native's is the whatwg-fetch polyfill, which held
 * the text `[object ReadableStream]` when it was made of an Expo answer's
 * stream, and React Native has no streams at all without Expo — the answer
 * reads itself, and a call that stops waiting is given its reason at once
 * while the copy it left is read out unseen; there a download is counted by
 * the XMLHttpRequest that brought it.
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
export async function readBody<F extends BodyForm>(
  response: Response,
  form: F,
  { signal, counter }: BodyReading = {},
): Promise<BodyForms[F]> {
  if (signal?.aborted) throw abortReason(signal);
  const { body } = response;
  if ((!signal && !counter) || body == null || !responseTakesStreams()) {
    return (await untilLeft(response[form](), signal)) as BodyForms[F];
  }
  const decoder = form === "text" ? new TextDecoder() : undefined;
  const parts: BlobPart[] = [];
  let text = "";
  await readChunks(
    counter ? counter(body, response.headers) : body,
    (chunk) => {
      if (decoder) text += decoder.decode(chunk, IN_PARTS);
      else parts.push(ownedBytes(chunk));
    },
    signal,
  );
  if (decoder) return (text + decoder.decode()) as BodyForms[F];
  const init = { __proto__: null, headers: response.headers } as ResponseInit;
  return (await new Response(new Blob(parts), init)[form]()) as BodyForms[F];
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
