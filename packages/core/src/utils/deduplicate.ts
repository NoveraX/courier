import { HTTPError } from "../errors";
import { studioHooks } from "../studio";

export type DedupeHost = {
  pendingRequests: { [key: string]: AbortController };
};

export const supportsAbortController = typeof globalThis.AbortController === "function";

export function getDedupeKey(url: string, method: string): string {
  if (!url) return "";
  const queryIndex = url.indexOf("?");
  const hashIndex = url.indexOf("#");
  const endIndex = queryIndex >= 0 ? queryIndex : hashIndex >= 0 ? hashIndex : url.length;
  return `${method}:${url.slice(0, endIndex)}`;
}

export function deduplicateAndAbortPrevious(host: DedupeHost, dedupeKey: string): AbortController {
  const existing = host.pendingRequests[dedupeKey];

  if (existing) {
    delete host.pendingRequests[dedupeKey];
    studioHooks.onDedupAbort?.({
      requestId: dedupeKey,
      key: dedupeKey,
      timestamp: Date.now(),
    });
    studioHooks.onRequestAbort?.({
      id: dedupeKey,
      reason: "deduplication",
      timestamp: Date.now(),
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
  host.pendingRequests[dedupeKey] = controller;
  return controller;
}

/**
 * Forget a finished request.
 *
 * Only its own entry is removed. By the time an aborted request settles, a
 * newer one holds the key; deleting by key alone would forget the newer
 * request, and a third call could not cancel it.
 */
export function cleanupDeduplication(
  host: DedupeHost,
  dedupeKey: string,
  controller: AbortController,
): void {
  if (host.pendingRequests[dedupeKey] === controller) {
    delete host.pendingRequests[dedupeKey];
  }
}
