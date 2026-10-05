import type { ProcessStatus } from "@/store/mock-slice";

/** How a mock process's state reads: its word, its colour, and whether it pulses while it changes. */
export const PROCESS_STATUS: Readonly<
  Record<ProcessStatus, { label: string; className: string; pulse: boolean }>
> = {
  declared: { label: "Not started", className: "text-fg-subtle", pulse: false },
  starting: { label: "Starting", className: "text-brand", pulse: true },
  running: { label: "Running", className: "text-ok", pulse: false },
  stopping: { label: "Stopping", className: "text-warn", pulse: true },
  stopped: { label: "Stopped", className: "text-fg-subtle", pulse: false },
  crashed: { label: "Crashed", className: "text-err", pulse: false },
  restarting: { label: "Restarting", className: "text-brand", pulse: true },
};
