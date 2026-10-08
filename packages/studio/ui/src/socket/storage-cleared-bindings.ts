import type { Socket } from "socket.io-client";
import { useContractStore } from "@/features/contract/contract-store";
import { useStudioStore } from "@/store";
import { useMockStore } from "@/store/mock-slice";
import type { StudioState } from "@/store/store-types";
import { isPlainObject } from "./is-plain-object";

/** The part of the store a clear in Settings → Storage reaches. */
export type ClearedStore = Pick<
  StudioState,
  "shownSession" | "showLive" | "clearRequests" | "clearPlaygroundHistory"
>;

function kindsOf(raw: unknown): ReadonlySet<unknown> {
  return isPlainObject(raw) && Array.isArray(raw.kinds) ? new Set(raw.kinds) : new Set();
}

/**
 * Let go of what Settings → Storage cleared, on every open page: Studio
 * says what went, and each page drops its own copy — the captured
 * requests, the mocks' logs, the Playground's history — and a page that
 * showed a saved session, once the sessions are gone, goes back to the live
 * requests. A page that shows a session keeps its requests when only the
 * captured ones go.
 *
 * @param socket - The `/ui` socket
 * @param store - Reads the store's actions
 * @returns Removes the listener
 * @example
 * ```ts
 * const unbind = bindStorageCleared(getSocket(), useStudioStore.getState);
 * ```
 */
export function bindStorageCleared(socket: Socket, store: () => ClearedStore): () => void {
  const onCleared = (raw: unknown): void => {
    const kinds = kindsOf(raw);
    const studio = store();
    if (kinds.has("sessions") && studio.shownSession !== null) studio.showLive();
    else if (kinds.has("requests") && studio.shownSession === null) studio.clearRequests();
    if (kinds.has("mockLogs")) useMockStore.setState({ logs: [] });
    if (kinds.has("playground")) studio.clearPlaygroundHistory();
    if (kinds.has("observations")) useContractStore.setState({ byEndpoint: new Map() });
  };
  /* The room the database takes, as Studio says it on connecting, every so often, and after a clear. */
  const onSize = (raw: unknown): void => {
    const onDisk = isPlainObject(raw) ? raw.onDisk : undefined;
    if (typeof onDisk === "number" && onDisk >= 0)
      useStudioStore.setState({ databaseBytes: onDisk });
  };
  socket.on("storage:cleared", onCleared);
  socket.on("storage:size", onSize);
  return () => {
    socket.off("storage:cleared", onCleared);
    socket.off("storage:size", onSize);
  };
}
