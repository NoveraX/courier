import type { ConfigStatusPayload } from "@/store/config-status";
import type { MocksFileStatus } from "@/store/mocks-file-status";
import type { ScannedSource } from "@/views/apis/types";

/** What of the project Studio runs a plan is made from. */
export interface ProjectSignals {
  configStatus: ConfigStatusPayload | null;
  scanSources: readonly ScannedSource[];
  mocksFileStatus: MocksFileStatus | null;
}

/** A store the signals are read from, such as `useStudioStore`. */
export interface ProjectStore<TState extends ProjectSignals> {
  subscribe(listener: (state: TState, previous: TState) => void): () => void;
}

function configChanged(
  next: ConfigStatusPayload | null,
  prev: ConfigStatusPayload | null,
): boolean {
  return next?.state !== prev?.state || next?.revision !== prev?.revision;
}

function mocksChanged(next: MocksFileStatus | null, prev: MocksFileStatus | null): boolean {
  return next?.file !== prev?.file || next?.error !== prev?.error;
}

/**
 * Call back when the project Studio runs changes in a way that can change a
 * plan: a new outcome of loading `courier.config` (`config:status`), a new
 * source catalogue (`scan:sources`), or the mocks file loading differently
 * (`mocks:status`). Other changes to the store are ignored.
 *
 * @param store - The store the socket writes the signals to
 * @param onChange - Called once per change
 * @returns Stops watching
 *
 * @example
 * ```ts
 * useEffect(() => watchProject(useStudioStore, () => session.projectChanged()), [session]);
 * ```
 */
export function watchProject<TState extends ProjectSignals>(
  store: ProjectStore<TState>,
  onChange: () => void,
): () => void {
  return store.subscribe((next, prev) => {
    if (
      configChanged(next.configStatus, prev.configStatus) ||
      next.scanSources !== prev.scanSources ||
      mocksChanged(next.mocksFileStatus, prev.mocksFileStatus)
    ) {
      onChange();
    }
  });
}
