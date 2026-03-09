import type { NormalizedOptions } from "ky";
import { HTTPError } from "../error";
import type { HttpClient } from "../instance/index";

export const supportsAbortController = typeof globalThis.AbortController === "function";

export function mergeAbortSignals(
  this: HttpClient,
  newSignal: AbortSignal,
  originalSignal: AbortSignal,
  url: string,
) {
  if (typeof globalThis.AbortSignal?.any === "function") {
    return AbortSignal.any([newSignal, originalSignal]);
  }

  const handler = () => {
    const source = this.pendingRequests[url];
    if (source) {
      delete this.pendingRequests[url];
      source.abort("cancel request");
    }
  };

  originalSignal.addEventListener("abort", handler, { once: true });

  newSignal.addEventListener("abort", () => originalSignal.removeEventListener("abort", handler), {
    once: true,
  });

  return newSignal;
}

export function deduplicateRequest(this: HttpClient, request: Request, options: NormalizedOptions) {
  const dedupeKey = getDedupeKey(request.url, request.method);

  const source = this.pendingRequests[dedupeKey];

  if (source) {
    delete this.pendingRequests[dedupeKey];
    source.abort(
      new HTTPError({
        data: {
          success: false,
          message: "cancel request",
        },
        status: 499,
        headers: new Headers(),
      }),
    );
  }

  const cancelToken = new AbortController();
  this.pendingRequests[dedupeKey] = cancelToken;

  options.signal = mergeAbortSignals.call(this, cancelToken.signal, request.signal, dedupeKey);

  return new Request(request, options);
}

export function cleanupAfterResponse(this: HttpClient, request: Request) {
  const url = getDedupeKey(request.url, request.method);
  if (this.pendingRequests[url]) {
    delete this.pendingRequests[url];
  }
}

export function getDedupeKey(url: string, method: string) {
  if (!url) return "";
  const queryIndex = url.indexOf("?");
  const hashIndex = url.indexOf("#");
  const endIndex = queryIndex >= 0 ? queryIndex : hashIndex >= 0 ? hashIndex : url.length;
  return `${method}:${url.slice(0, endIndex)}`;
}
