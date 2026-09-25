import type { Socket } from "socket.io-client";

import type { ApiSourceChange } from "@/store/config-transition";
import type { MocksFileStatus } from "@/store/mocks-file-status";
import type { StudioState } from "@/store/store-types";

import { notifyConfigTransition } from "@/store/config-notifications";
import { isConfigStatusPayload } from "./config-status-guard";
import { isPlainObject } from "./is-plain-object";
import { isScannedSource, isSourceSummary } from "./source-list-guards";
import { sourcesListOf } from "./sources-list-of";

/** The part of the store the project's events write. */
export type ApisStore = Pick<
  StudioState,
  | "configStatus"
  | "setConfigStatus"
  | "mocksFileStatus"
  | "setMocksFileStatus"
  | "setRegistrySources"
  | "setScanSources"
  | "settings"
>;

/**
 * Listen for the project Studio runs: the imports list (`registry:updated`),
 * the source catalogue (`scan:sources`), how the config loads
 * (`config:status`) and how the mocks file loads (`mocks:status`, which the
 * Mocks view shows). A config status that changes is announced; a reload is
 * announced with the files of the latest change to the API sources the
 * watcher reported, which is why `watcher:change` is heard here too, and
 * without the mocks file `mocks:status` names (see `configTransitionNotice`).
 *
 * A list entry the UI cannot show is left out, and the rest replace the list
 * (`sourcesListOf`).
 *
 * A disconnect forgets both statuses: the next connect replays them, and
 * until then the UI does not know how the config and the mocks file load.
 *
 * @param socket - The `/ui` socket
 * @param store - Reads and writes the store
 * @returns Removes every listener it added
 *
 * @example
 * ```ts
 * const unbindApis = bindApis(getSocket(), useStudioStore.getState);
 * // on teardown
 * unbindApis();
 * ```
 */
export function bindApis(socket: Socket, store: () => ApisStore): () => void {
  let lastApiChange: ApiSourceChange | null = null;

  const onRegistryUpdated = (data: unknown): void => {
    const sources = sourcesListOf(data, isSourceSummary, "registry:updated");
    if (sources) store().setRegistrySources(sources);
  };
  const onScanSources = (data: unknown): void => {
    const sources = sourcesListOf(data, isScannedSource, "scan:sources");
    if (sources) store().setScanSources(sources);
  };
  const onWatcherChange = (data: unknown): void => {
    const change = apiSourceChangeOf(data);
    if (change) lastApiChange = change;
  };
  const onMocksStatus = (data: unknown): void => {
    if (isMocksFileStatus(data)) store().setMocksFileStatus(data);
  };
  const onConfigStatus = (data: unknown): void => {
    if (!isConfigStatusPayload(data)) return;
    const { configStatus: prev, settings, mocksFileStatus: mocks } = store();
    store().setConfigStatus(data);
    notifyConfigTransition(prev, data, {
      lastChange: lastApiChange,
      announceReloads: settings.toastOnFileChange,
      mocks,
    });
  };
  const onDisconnect = (): void => {
    store().setMocksFileStatus(null);
    store().setConfigStatus(null);
  };

  const listeners: ReadonlyArray<[string, (data: unknown) => void]> = [
    ["registry:updated", onRegistryUpdated],
    ["scan:sources", onScanSources],
    ["watcher:change", onWatcherChange],
    ["mocks:status", onMocksStatus],
    ["config:status", onConfigStatus],
    ["disconnect", onDisconnect],
  ];
  for (const [event, listener] of listeners) socket.on(event, listener);
  return () => {
    for (const [event, listener] of listeners) socket.off(event, listener);
  };
}

function apiSourceChangeOf(data: unknown): ApiSourceChange | null {
  if (!isPlainObject(data) || data.source !== "api") return null;
  const { files, timestamp } = data;
  if (!Array.isArray(files) || typeof timestamp !== "number") return null;
  return { files: files.filter((file): file is string => typeof file === "string"), timestamp };
}

function isMocksFileStatus(data: unknown): data is MocksFileStatus {
  return (
    isPlainObject(data) &&
    (data.file === null || typeof data.file === "string") &&
    (data.error === null || typeof data.error === "string")
  );
}
