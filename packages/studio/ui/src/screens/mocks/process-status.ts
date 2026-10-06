import type { ProcessStatus } from "@/store/mock-slice";

/** How a mock process's state reads: its word, its colour, and whether it is changing — its controls wait meanwhile. */
export const PROCESS_STATUS: Readonly<
  Record<ProcessStatus, { label: string; className: string; changing: boolean }>
> = {
  declared: { label: "Not started", className: "text-fg-subtle", changing: false },
  starting: { label: "Starting", className: "text-brand", changing: true },
  running: { label: "Running", className: "text-ok", changing: false },
  stopping: { label: "Stopping", className: "text-warn", changing: true },
  stopped: { label: "Stopped", className: "text-fg-subtle", changing: false },
  crashed: { label: "Crashed", className: "text-err", changing: false },
  restarting: { label: "Restarting", className: "text-brand", changing: true },
};
