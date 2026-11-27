import { studioCapability } from "../capabilities/registry";
import { isRequestFailure, type RequestFailure } from "../errors";
import type { Answer } from "../utils/answer";
import type { CoreFetchInit } from "../utils/fetch";
import { coreFetch } from "../utils/fetch";
import { asProxyFailure, readProxyAnswer } from "./proxy-answer";

export async function sendFetch(
  method: "get" | "post",
  url: string,
  options: Record<string, unknown>,
  ctx: {
    stream: boolean;
    /** Whether the call asked for `.raw`. */
    raw: boolean;
    onSuccess?: ((data: unknown) => void | Promise<void>) | undefined;
    onError?: ((error: RequestFailure) => void | Promise<void>) | undefined;
  },
): Promise<unknown> {
  const studio = studioCapability();
  const instrumented = studio?.proxyUploads(options) ?? options;
  /* A streamed answer is read as it arrives, by one reader: never shared, never kept. */
  const fetchOptions = ctx.stream ? { ...instrumented, streamed: true } : instrumented;
  const hasTimingHook = studio?.hooks.onProxyClientTiming !== undefined;
  const t0 = hasTimingHook ? performance.now() : 0;

  let answer: Answer | undefined;
  let tHeaders = 0;
  try {
    answer = await coreFetch(method, url, fetchOptions as CoreFetchInit);
    tHeaders = hasTimingHook ? performance.now() : 0;
    const data = await readProxyAnswer(answer, ctx.raw, ctx.stream);
    await ctx.onSuccess?.(data);
    return data;
  } catch (error) {
    throw await toldFailure(error, signalOf(options), ctx.onError);
  } finally {
    if (answer) studio?.proxyClientTiming(answer.response, t0, tHeaders);
  }
}

/**
 * What a proxy call that failed rejects with, as `asProxyFailure` makes it,
 * once `onError` has been told of it where it is a request's failure.
 *
 * @param error - Whatever the call's sending rejected with
 * @param signal - The call's signal
 * @param onError - The caller's handler of a request's failure
 * @returns The error to reject the call with
 * @example
 * ```ts
 * throw await toldFailure(error, signal, onError);
 * ```
 */
export async function toldFailure(
  error: unknown,
  signal: AbortSignal | undefined,
  onError: ((error: RequestFailure) => void | Promise<void>) | undefined,
): Promise<unknown> {
  const failure = asProxyFailure(error, signal);
  if (isRequestFailure(failure)) await onError?.(failure);
  return failure;
}

function signalOf(options: Record<string, unknown>): AbortSignal | undefined {
  return options.signal instanceof AbortSignal ? options.signal : undefined;
}
