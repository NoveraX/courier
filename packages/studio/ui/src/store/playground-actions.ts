import { PLAYGROUND_MAX_HISTORY } from "./constants";
import type { StudioSet } from "./store-access";
import type { StudioState } from "./store-types";
import type { PlaygroundHistoryEntry } from "./types-ui";

/** How many of a stream's events the Playground keeps to show. */
export const MAX_SHOWN_CHUNKS = 500;

type PlaygroundActions = Pick<
  StudioState,
  | "addPlaygroundEntry"
  | "updatePlaygroundEntry"
  | "setPlaygroundActiveResponse"
  | "clearPlaygroundHistory"
  | "appendPlaygroundChunk"
  | "endPlayground"
  | "errorPlayground"
>;

/**
 * The Studio store's playground actions: its history, and the rid-keyed
 * reducers the socket listeners call for `playground:chunk`,
 * `playground:end` and `playground:error`. Those are routed by the `rid`
 * stamped on the entry at send time, so the history stays decoupled from
 * any server-assigned correlation id.
 *
 * They change a run only while it is pending: one that ended — cancelled,
 * or stopped from the page — is final, and an answer that arrives after it
 * does not take its place. An answer for an entry cleared from the history
 * ("Clear") changes nothing: the server drains its in-flight entry via
 * `onUiDisconnect` on the next socket teardown, so dropping it here leaks
 * no state.
 *
 * @param set - The store's `set`
 * @returns The actions
 *
 * @example
 * ```ts
 * create<StudioState>((set, get) => ({ ...createPlaygroundActions(set), ... }));
 * ```
 */
export function createPlaygroundActions(set: StudioSet): PlaygroundActions {
  return {
    addPlaygroundEntry: (entry) =>
      set((s) => ({
        playgroundHistory: [entry, ...s.playgroundHistory].slice(0, PLAYGROUND_MAX_HISTORY),
        playgroundActiveResponse: entry,
      })),
    updatePlaygroundEntry: (id, patch) =>
      set((s) => {
        const updated = s.playgroundHistory.map((h) => (h.id === id ? { ...h, ...patch } : h));
        const active =
          s.playgroundActiveResponse?.id === id
            ? { ...s.playgroundActiveResponse, ...patch }
            : s.playgroundActiveResponse;
        return { playgroundHistory: updated, playgroundActiveResponse: active };
      }),
    setPlaygroundActiveResponse: (entry) => set({ playgroundActiveResponse: entry }),
    clearPlaygroundHistory: () => set({ playgroundHistory: [], playgroundActiveResponse: null }),
    appendPlaygroundChunk: (rid, chunk) =>
      set((s) =>
        patchRun(s, rid, (entry) => {
          /* Progress replaces the last; it is not kept as part of the answer. */
          if (chunk.kind === "upload-progress") {
            const { loaded, total, percentage } = chunk;
            return { ...entry, upload: { loaded, total, percentage } };
          }
          /* A channel that connected streams, whether or not it said anything yet. */
          if (chunk.kind === "ws-open") {
            return entry.streamStatus === "connecting"
              ? { ...entry, streamStatus: "streaming" }
              : entry;
          }
          /* The last ones only: a long stream copied its whole list for
             every event, and grew without end. */
          const previous = entry.chunks ?? [];
          const shed = Math.max(0, previous.length + 1 - MAX_SHOWN_CHUNKS);
          const next: PlaygroundHistoryEntry = {
            ...entry,
            chunks: [...previous.slice(shed), chunk],
            ...(shed > 0 && { chunksDropped: (entry.chunksDropped ?? 0) + shed }),
          };
          if (chunk.kind === "http-result") {
            next.statusCode = chunk.status;
            // An error answer's body says more than the message lifted from it.
            next.response = chunk.data !== undefined ? chunk.data : chunk.error;
            if (chunk.headers) next.responseHeaders = chunk.headers;
          } else if (entry.streamStatus === "connecting") {
            next.streamStatus = "streaming";
          }
          return next;
        }),
      ),
    endPlayground: (rid, summary) =>
      set((s) =>
        patchRun(s, rid, (entry) => {
          /* A call cancelled before its answer came; a stream stopped from the page simply ended. */
          if (summary.cancelled && !entry.transport) {
            return {
              ...entry,
              status: "cancelled",
              duration: summary.durationMs,
              upload: undefined,
            };
          }
          // A failing http-result keeps the "error" status rather than
          // flipping to success on the terminal end event.
          const errored =
            entry.status === "error" ||
            (entry.chunks?.some((c) => c.kind === "http-result" && c.error !== undefined) ?? false);
          return {
            ...entry,
            status: errored ? "error" : "success",
            duration: summary.durationMs,
            streamStatus: entry.transport ? (errored ? "error" : "complete") : entry.streamStatus,
          };
        }),
      ),
    errorPlayground: (rid, error) =>
      set((s) =>
        patchRun(s, rid, (entry) => ({
          ...entry,
          status: "error",
          response: error.message,
          streamStatus: entry.transport ? "error" : entry.streamStatus,
        })),
      ),
  };
}

/* Change the run a rid names, in the history and where it is shown — while it is pending: an ended run is final. */
function patchRun(
  s: StudioState,
  rid: string,
  patch: (entry: PlaygroundHistoryEntry) => PlaygroundHistoryEntry,
): Pick<StudioState, "playgroundHistory" | "playgroundActiveResponse"> {
  const apply = (entry: PlaygroundHistoryEntry): PlaygroundHistoryEntry =>
    entry.rid === rid && entry.status === "pending" ? patch(entry) : entry;
  const active = s.playgroundActiveResponse;
  return {
    playgroundHistory: s.playgroundHistory.map(apply),
    playgroundActiveResponse: active ? apply(active) : active,
  };
}
