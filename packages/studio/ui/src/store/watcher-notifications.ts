import { toast } from "sonner";

import type { StudioState } from "./store-types";

type Getter = () => StudioState;

const DEBOUNCE_MS = 500;

let changeTimer: ReturnType<typeof setTimeout> | undefined;
let pendingFiles: string[] = [];
let pendingSource: "api" | "mock" = "api";

/** Debounced toast for file change events — batches rapid changes */
export function notifyFileChange(
  source: "api" | "mock",
  files: string[],
  get: Getter,
): void {
  if (!get().settings.toastOnFileChange) return;

  pendingSource = source;
  const validFiles = files.filter(Boolean);
  if (validFiles.length === 0) return;

  pendingFiles = [...new Set([...pendingFiles, ...validFiles])];

  clearTimeout(changeTimer);
  changeTimer = setTimeout(() => {
    const count = pendingFiles.length;
    const label = pendingSource === "api" ? "API sources" : "Mock server";
    const detail = count === 1 ? pendingFiles[0] : `${count} files`;
    toast.info(`${label} reloaded — ${detail}`);
    pendingFiles = [];
  }, DEBOUNCE_MS);
}
