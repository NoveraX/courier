import { devtoolsHooks } from "../devtools";
import { HTTPError } from "../error";
import type { HttpClient } from "../http-client/index";

export const supportsAbortController = typeof globalThis.AbortController === "function";

export function getDedupeKey(url: string, method: string) {
  if (!url) return "";
  const queryIndex = url.indexOf("?");
  const hashIndex = url.indexOf("#");
  const endIndex = queryIndex >= 0 ? queryIndex : hashIndex >= 0 ? hashIndex : url.length;
  return `${method}:${url.slice(0, endIndex)}`;
}

export function deduplicateAndAbortPrevious(
  client: HttpClient,
  dedupeKey: string,
): AbortController {
  const existing = client.pendingRequests[dedupeKey];

  if (existing) {
    delete client.pendingRequests[dedupeKey];
    devtoolsHooks.onDedupAbort?.({
      requestId: dedupeKey,
      key: dedupeKey,
      timestamp: performance.now(),
    });
    existing.abort(
      new HTTPError({
        data: { success: false, message: "cancel request" },
        status: 499,
        headers: new Headers(),
      }),
    );
  }

  const controller = new AbortController();
  client.pendingRequests[dedupeKey] = controller;
  return controller;
}

export function cleanupDeduplication(client: HttpClient, dedupeKey: string) {
  if (client.pendingRequests[dedupeKey]) {
    delete client.pendingRequests[dedupeKey];
  }
}
