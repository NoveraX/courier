import { cn } from "@/site/cn"
import { MB } from "./lab-settings"
import { reachedAt, seconds } from "./lab-stats"
import type { LabRun } from "./use-upload-lab"

const DOT = {
  recorded: "bg-fg-subtle",
  sending: "bg-tone-blue shadow-[0_0_12px_rgb(125_185_255/0.9)] motion-safe:animate-pulse",
  done: "bg-ok shadow-[0_0_12px_rgb(94_211_163/0.7)]",
  failed: "bg-err",
} as const

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
 * Where the run stands, as a lit dot and a line: recorded, sending, read —
 * with when the browser reported 100% and when the site answered — or why
 * it failed. Screen readers hear each change of phase; the running clock is
 * for the eye only.
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
      className="m-0 flex min-w-0 items-center gap-2.5 font-mono text-label text-fg-muted tabular-nums"
    >
      <span aria-hidden="true" className={cn("size-1.75 shrink-0 rounded-full", DOT[run.phase])} />
      <span className="min-w-0 [overflow-wrap:anywhere]">
        {lineOf(run)}
        {run.phase === "sending" && (
          <span aria-hidden="true" className="text-fg-subtle">
            {" "}
            · {seconds(run.elapsed)}
          </span>
        )}
      </span>
    </p>
  )
}
