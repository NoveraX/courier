"use client"

import { useState } from "react"

import { LabChannel } from "./lab-channel"
import { LabChart } from "./lab-chart"
import { LabControls } from "./lab-controls"
import { RECORDED_RUN } from "./lab-recorded"
import type { LabPace, LabSize } from "./lab-settings"
import { labStats } from "./lab-stats"
import { LabStatus } from "./lab-status"
import { useUploadLab } from "./use-upload-lab"

/**
 * The upload lab, as the upload guide shows it: a real upload from the
 * reader's browser to this site, drawn twice — as the browser reports it
 * and through smoothProgress — with both bars' numbers and the run over
 * time. Until the reader sends one, it shows a run recorded the same way.
 * The toolbar sends; the status line under it says what the bars and the
 * chart below show. It lays itself out by the room it is given: the bars
 * side by side from 640 px across, one above the other below that.
 *
 * @returns The lab
 * @example
 * ```mdx
 * <UploadLab />
 * ```
 */
export function UploadLab() {
  const [size, setSize] = useState<LabSize>(8)
  const [pace, setPace] = useState<LabPace>(4)
  const { run, send } = useUploadLab(RECORDED_RUN)
  return (
    <div
      data-tone="blue"
      className="@container relative my-6 overflow-hidden rounded-2xl border border-line bg-[linear-gradient(180deg,var(--color-panel),var(--color-bg-subtle))] shadow-[0_40px_100px_-70px_rgb(var(--tone-rgb)/0.55)]"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(60%_100%_at_75%_0%,rgb(var(--tone-rgb)/0.13),transparent_72%)]"
      />
      <div className="relative border-b border-line px-4.5 py-4 @min-[640px]:px-6">
        <LabControls
          size={size}
          pace={pace}
          sending={run.phase === "sending"}
          onSize={setSize}
          onPace={setPace}
          onSend={() => void send(size, pace)}
        />
      </div>
      <div className="relative grid gap-4 p-4.5 @min-[640px]:p-6">
        <LabStatus run={run} />
        <div className="grid gap-3.5 @min-[640px]:grid-cols-2">
          <LabChannel
            tone="amber"
            name="onUploadProgress"
            caption="as the browser reports it"
            share={run.reported.at(-1)?.[1] ?? 0}
            stats={labStats(run.reported)}
            moves="reports"
          />
          <LabChannel
            tone="blue"
            name="smoothProgress(…)"
            caption="the reports, smoothed"
            share={run.smoothed.at(-1)?.[1] ?? 0}
            stats={labStats(run.smoothed)}
            moves="moves"
          />
        </div>
        <div className="dots relative min-w-0 rounded-panel border border-line bg-bg/40 px-3 pt-3.5 pb-1.5">
          <ul className="m-0 mb-1.5 flex list-none flex-wrap gap-x-4.5 gap-y-1 p-0 px-1.5 font-mono text-micro text-fg-subtle">
            <li className="flex items-center gap-1.75">
              <span aria-hidden="true" className="h-0.5 w-3.5 rounded-full bg-tone-amber" />
              browser reports
            </li>
            <li className="flex items-center gap-1.75">
              <span aria-hidden="true" className="h-0.5 w-3.5 rounded-full bg-tone-blue" />
              smoothProgress
            </li>
            <li className="flex items-center gap-1.75">
              <span
                aria-hidden="true"
                className="h-0 w-3.5 border-t border-dashed border-fg-subtle"
              />
              the site answers
            </li>
          </ul>
          <LabChart run={run} />
        </div>
      </div>
      <p className="relative m-0 border-t border-line px-4.5 py-3.5 text-label leading-[1.55] text-fg-subtle @min-[640px]:px-6">
        The file is zeros your browser makes. This site reads it at the pace you pick, as a slow
        link would, then drops it.
      </p>
    </div>
  )
}
