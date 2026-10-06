import { cn } from "@/site/cn"
import { MB } from "./lab-settings"
import { reachedAt, seconds } from "./lab-stats"
import type { LabRun } from "./use-upload-lab"

/* What the run is doing, in one line. */
function lineOf(run: LabRun): string {
  const sent = `${run.size} MB at ${run.pace} MB/s`
  if (run.phase === "recorded") return `A recorded run · ${sent} — send your own`
  if (run.phase === "sending") return `Sending ${sent}`
  if (run.phase === "failed") return run.error ?? "The upload failed"
  const full = reachedAt(run.reported, 1)
  const read = `${((run.received ?? 0) / MB).toFixed(1)} MB read`
  const reported = full === null ? "" : ` · 100% reported at ${seconds(full)}`
  return `${read}${reported} · answered at ${seconds(run.answeredAt ?? run.elapsed)}`
}

/**
 * Where the run stands, in one line: recorded, sending, read — with when
 * the browser reported 100% and when the site answered — or, in the error
 * colour, why it failed. Screen readers hear each change of phase; the
 * running clock is for the eye only.
 *
 * @param props - The run
 * @returns The status
 * @example
 * ```tsx
 * <LabStatus run={run} />
 * ```
 */
export function LabStatus({ run }: { run: LabRun }) {
  return (
    <p
      aria-live="polite"
      className={cn(
        "m-0 min-w-0 font-mono text-label leading-[1.5] tabular-nums [overflow-wrap:anywhere]",
        run.phase === "failed" ? "text-err" : "text-fg-muted"
      )}
    >
      {lineOf(run)}
      {run.phase === "sending" && (
        <span aria-hidden="true" className="text-fg-subtle">
          {" "}
          · {seconds(run.elapsed)}
        </span>
      )}
    </p>
  )
}
