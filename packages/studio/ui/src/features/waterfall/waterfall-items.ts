import { endpointName, pathOf } from "@/features/requests/request-parts";
import { isStreamRequest } from "@/features/requests/request-state";
import { streamEnd } from "@/features/requests/stream-activity";
import type { RequestEntry } from "@/store/types";
import type { WaterfallMode } from "./waterfall-search";

/** How many HTTP requests the Waterfall draws at once: the newest that pass its search and mode. */
export const IN_VIEW = 50;

/** What narrows the Waterfall: its search, its mode, and — while it does not follow — the requests it held. */
export interface WaterfallScope {
  q: string;
  mode: WaterfallMode;
  held?: ReadonlySet<string> | undefined;
}

/**
 * Whether a request passes the Waterfall's search — over its endpoint and
 * path — and its mode.
 *
 * @param r - The request
 * @param scope - The search and mode
 * @returns `true` when it passes
 * @example
 * ```ts
 * matchesScope(request, { q: "users", mode: "proxy" });
 * ```
 */
export function matchesScope(r: RequestEntry, scope: WaterfallScope): boolean {
  if (scope.mode !== "all" && r.mode !== scope.mode) return false;
  const q = scope.q.toLowerCase();
  return q === "" || `${endpointName(r)} ${pathOf(r.url)}`.toLowerCase().includes(q);
}

/**
 * The HTTP requests the Waterfall draws: the newest {@link IN_VIEW} that
 * pass its search and mode, or, while it does not follow, the ones it held
 * when it stopped — so new traffic does not move what is being read.
 *
 * @param requests - The requests, newest first
 * @param scope - The search, the mode and the held requests
 * @returns The requests to draw, newest first
 * @example
 * ```ts
 * requestsInView(requests, { q: "", mode: "all" }).length; // ≤ 50
 * ```
 */
export function requestsInView(
  requests: readonly RequestEntry[],
  scope: WaterfallScope,
): RequestEntry[] {
  const http = requests.filter((r) => !isStreamRequest(r) && matchesScope(r, scope));
  const { held } = scope;
  return held ? http.filter((r) => held.has(r.id)) : http.slice(0, IN_VIEW);
}

/**
 * The streams the Waterfall draws above its requests: those that pass its
 * search and mode and were still open when the window starts.
 *
 * @param requests - The requests, newest first
 * @param scope - The search and mode
 * @param from - When the window starts
 * @param now - The time now, the end of a stream still open
 * @returns The streams, newest first
 * @example
 * ```ts
 * streamsInView(requests, { q: "", mode: "all" }, window.start, Date.now());
 * ```
 */
export function streamsInView(
  requests: readonly RequestEntry[],
  scope: WaterfallScope,
  from: number,
  now: number,
): RequestEntry[] {
  return requests.filter(
    (r) => isStreamRequest(r) && matchesScope(r, scope) && streamEnd(r, now) > from,
  );
}
