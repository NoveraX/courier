import { studioCapability } from "../capabilities/registry";
import { isRequestFailure, type RequestFailure } from "../errors";
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
  const fetchOptions = ctx.stream ? { ...instrumented, coalesce: false } : instrumented;
  const hasTimingHook = studio?.hooks.onProxyClientTiming !== undefined;
  const t0 = hasTimingHook ? performance.now() : 0;

  let response: Response | undefined;
  let tHeaders = 0;
  try {
    response = await coreFetch(method, url, fetchOptions as CoreFetchInit);
    tHeaders = hasTimingHook ? performance.now() : 0;
    const data = await readProxyAnswer(response, ctx.raw, ctx.stream);
    await ctx.onSuccess?.(data);
    return data;
  } catch (error) {
    const failure = asProxyFailure(error, signalOf(options));
    if (isRequestFailure(failure)) await ctx.onError?.(failure);
    throw failure;
  } finally {
    if (response) studio?.proxyClientTiming(response, t0, tHeaders);
  }
}

function signalOf(options: Record<string, unknown>): AbortSignal | undefined {
  return options.signal instanceof AbortSignal ? options.signal : undefined;
}
