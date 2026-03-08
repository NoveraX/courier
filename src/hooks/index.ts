import type { NormalizedOptions } from "ky";
import { HTTPError } from "../error";
import type { Instance } from "../instance/index";

export const supportsAbortController = typeof globalThis.AbortController === "function";

export function makeSignals(
  this: Instance,
  newSignal: AbortSignal,
  originalSignal: AbortSignal,
  url: string,
) {
  if (typeof globalThis.AbortSignal?.any === "function") {
    return AbortSignal.any([newSignal, originalSignal]);
  }

  const handler = () => {
    const source = this.currentExecutingRequests[url];
    if (source) {
      delete this.currentExecutingRequests[url];
      source.abort("cancel request");
    }
  };

  originalSignal.addEventListener("abort", handler, { once: true });

  newSignal.addEventListener("abort", () => originalSignal.removeEventListener("abort", handler), {
    once: true,
  });

  return newSignal;
}

export function beforeRequestHook(this: Instance, request: Request, options: NormalizedOptions) {
  const cancelUniqId = pathAndOrigin(request.url, request.method);

  const source = this.currentExecutingRequests[cancelUniqId];

  if (source) {
    delete this.currentExecutingRequests[cancelUniqId];
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
  this.currentExecutingRequests[cancelUniqId] = cancelToken;

  options.signal = makeSignals.call(this, cancelToken.signal, request.signal, cancelUniqId);

  return new Request(request, options);
}

export function afterResponse(this: Instance, request: Request) {
  const url = pathAndOrigin(request.url, request.method);
  if (this.currentExecutingRequests[url]) {
    delete this.currentExecutingRequests[url];
  }
}

export function pathAndOrigin(url: string, method: string) {
  if (!url) return "";
  const queryIndex = url.indexOf("?");
  const hashIndex = url.indexOf("#");
  const endIndex = queryIndex >= 0 ? queryIndex : hashIndex >= 0 ? hashIndex : url.length;
  return `${method}:${url.slice(0, endIndex)}`;
}
