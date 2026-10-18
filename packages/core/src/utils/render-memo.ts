import { abortReason } from "./abort-reason";
import { type KeptAnswer, keepAnswer, replayAnswer } from "./kept-answer";
import type { SharingCall } from "./shared-answer";
import { shareFlight } from "./shared-flight";

/** The reads one render has made, by what each sent; absent outside a render. */
export type RenderMemo = Map<string, Promise<KeptAnswer | undefined>>;

/** Hands out the memo of the render being served, or nothing outside one. */
export type RenderMemoProvider = () => RenderMemo | undefined;

let provider: RenderMemoProvider | undefined;

/**
 * Let a framework scope reads to the render it serves: within one render, a
 * request sent again — the same method, address, headers and body — is
 * answered with the first one's answer however far apart the two are, as a
 * page's metadata and its body are. A write made in the render forgets
 * every read, so what is read after it is read anew; a session the render
 * renewed sends other cookies, so its reads go out again. Next.js's adapter
 * registers React's `cache()`.
 *
 * @param next - Hands out the memo of the render being served
 * @returns Undoes the registration
 * @example
 * ```ts
 * registerRenderMemo(cache(() => new Map()));
 * ```
 */
export function registerRenderMemo(next: RenderMemoProvider): () => void {
  provider = next;
  return () => {
    if (provider === next) provider = undefined;
  };
}

/**
 * Forget the reads of the render being served, after a write it made: the
 * write may have changed what they answered.
 *
 * @example
 * ```ts
 * if (!reads) forgetRenderReads();
 * ```
 */
export function forgetRenderReads(): void {
  provider?.()?.clear();
}

/**
 * Answer a read: with the answer the render had for the same request, else
 * from the identical request in flight, else by sending it — and keep a
 * successful answer for the rest of the render once its body has arrived.
 * A call answered without a request of its own is told whose answered it.
 *
 * @param key - What the request sends, written out
 * @param signal - Fires when this call stops waiting
 * @param send - Sends the request, cancelled through the signal it is given, if any
 * @param call - The call, as Studio knows it, and what it is told when its answer is shared
 * @returns This call's answer
 * @example
 * ```ts
 * const response = await answerRead(key, signal, (sendSignal) => fetch(url, { signal: sendSignal }));
 * ```
 */
export function answerRead(
  key: string,
  signal: AbortSignal | undefined,
  send: (signal: AbortSignal | undefined) => Promise<Response>,
  call?: SharingCall,
): Promise<Response> {
  const memo = provider?.();
  /* Outside a render the call joins its flight at once, before anything else it set off runs. */
  if (memo === undefined) return shareFlight(key, signal, send, call);
  return answerInRender(memo, key, signal, send, call);
}

async function answerInRender(
  memo: RenderMemo,
  key: string,
  signal: AbortSignal | undefined,
  send: (signal: AbortSignal | undefined) => Promise<Response>,
  call: SharingCall | undefined,
): Promise<Response> {
  const kept = await memo.get(key);
  if (signal?.aborted) throw abortReason(signal);
  if (kept !== undefined) {
    call?.onShared?.({ by: "render", with: kept.by });
    return replayAnswer(kept);
  }
  /* Kept as the answer comes, for the call its request belongs to, before any call reads it. */
  return shareFlight(key, signal, send, call, (response, owner) => {
    if (response.ok) remember(memo, key, keepAnswer(response.clone(), owner?.id));
  });
}

/* A read whose body does not arrive whole is not kept, and the next one asks again. */
function remember(memo: RenderMemo, key: string, kept: Promise<KeptAnswer | undefined>): void {
  memo.set(key, kept);
  void kept.then((answer) => {
    if (answer === undefined && memo.get(key) === kept) memo.delete(key);
  });
}
