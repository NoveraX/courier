import { useStudioStore } from "@/store";
import { useMockStore } from "@/store/mock-slice";

/** What Studio says about the files it watches. */
export interface WatchState {
  label: string;
  /** A mock reloads after an edit, which reads as a warning. */
  reloading: boolean;
}

/**
 * The files Studio watches, or that a mock reloads after an edit — nothing
 * while it watches none and no mock reloads.
 *
 * @returns What to say, or `null`
 * @example
 * ```tsx
 * const watch = useWatchState();
 * if (watch) return <span>{watch.label}</span>;
 * ```
 */
export function useWatchState(): WatchState | null {
  const watched = useStudioStore((s) => s.watcherApiPaths);
  const reloading = useMockStore((s) =>
    Object.values(s.servers).some((server) => server.processStatus === "restarting"),
  );
  if (watched === 0 && !reloading) return null;
  return { label: reloading ? "reloading…" : `watching ${watched}`, reloading };
}
