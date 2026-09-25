import { toast } from "sonner";

import type { StudioState } from "./store-types";

type Getter = () => Pick<StudioState, "settings">;

const DEBOUNCE_MS = 500;

let changeTimer: ReturnType<typeof setTimeout> | undefined;
let pendingFiles: string[] = [];

/**
 * Announce a change the watcher saw in the mocks, batching rapid changes
 * into one toast. A change to the API sources is announced once the config
 * has loaded it (`config-transition.ts`), not when the watcher sees it: the
 * load that follows may still fail.
 *
 * @param source - What the changed files belong to
 * @param files - The files that changed
 * @param get - Reads the settings: nothing is announced when file-change toasts are off
 *
 * @example
 * ```ts
 * notifyFileChange("mock", ["petstore"], useStudioStore.getState);
 * // after 500 ms without another change → "Mock server reloaded — petstore"
 * ```
 */
export function notifyFileChange(source: "api" | "mock", files: string[], get: Getter): void {
  if (source !== "mock" || !get().settings.toastOnFileChange) return;

  const validFiles = files.filter(Boolean);
  if (validFiles.length === 0) return;

  pendingFiles = [...new Set([...pendingFiles, ...validFiles])];

  clearTimeout(changeTimer);
  changeTimer = setTimeout(() => {
    const count = pendingFiles.length;
    const detail = count === 1 ? pendingFiles[0] : `${count} files`;
    toast.info(`Mock server reloaded — ${detail}`);
    pendingFiles = [];
  }, DEBOUNCE_MS);
}
