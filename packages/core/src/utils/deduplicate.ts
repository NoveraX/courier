import { HTTPError } from "../error";
import { studioHooks } from "../studio";

export type DedupeHost = {
  pendingRequests: { [key: string]: AbortController };
};

export const supportsAbortController = typeof globalThis.AbortController === "function";

export function getDedupeKey(url: string, method: string) {
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

export function cleanupDeduplication(host: DedupeHost, dedupeKey: string) {
  if (host.pendingRequests[dedupeKey]) {
    delete host.pendingRequests[dedupeKey];
  }
}
