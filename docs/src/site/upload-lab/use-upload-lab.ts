"use client"

import { isHTTPError, smoothProgress, type UploadProgress } from "@noverax/courier"
import { useCallback, useEffect, useRef, useState } from "react"

import { labCaller } from "./lab-api"
import { grownSpan, startSpan } from "./lab-geometry"
import { LAB_PACE_HEADER, type LabPace, type LabSize, MB } from "./lab-settings"
import type { LabPoint } from "./lab-stats"

/** Where a run is: the recorded one shown at first, one being sent, sent, or failed. */
export type LabPhase = "recorded" | "sending" | "done" | "failed"

/** One upload, as both bars saw it. */
export interface LabRun {
  phase: LabPhase
  size: LabSize
  pace: LabPace
  /** Each report the browser made. */
  reported: readonly LabPoint[]
  /** Each move smoothProgress made of the same reports. */
  smoothed: readonly LabPoint[]
  /** The ms since the send, while it runs; when the site answered, once over. */
  elapsed: number
  /** The time the chart spans, in ms: set as the run starts, grown only while it runs. */
  span: number
  /** When the site's answer came, in ms. */
  answeredAt: number | null
  /** The bytes the site read. */
  received: number | null
  error: string | null
}

const BUSY = "The lab is reading other visitors' uploads. Send again in a few seconds."

function messageOf(error: unknown): string {
  if (isHTTPError(error) && error.status === 429) return BUSY
  return error instanceof Error ? error.message : "The upload failed"
}

/**
 * Run the upload lab: send a file of zeros made in the browser, at the
 * pace the site reads it, and keep every report the browser makes and
 * every move smoothProgress makes of them. The run is redrawn each frame
 * while it goes; leaving the page cancels it.
 *
 * @param recorded - The run shown until the visitor sends their own
 * @returns The run, and how to send one
 * @example
 * ```tsx
 * const { run, send } = useUploadLab(RECORDED_RUN)
 * <button onClick={() => send(8, 4)}>Send</button>
 * ```
 */
export function useUploadLab(recorded: LabRun) {
  const [run, setRun] = useState(recorded)
  const live = useRef({ controller: new AbortController(), frame: 0 })

  useEffect(() => {
    const current = live.current
    return () => {
      current.controller.abort()
      cancelAnimationFrame(current.frame)
    }
  }, [])

  const send = useCallback(async (size: LabSize, pace: LabPace) => {
    live.current.controller.abort()
    cancelAnimationFrame(live.current.frame)
    const controller = new AbortController()
    live.current.controller = controller
    const started = performance.now()
    const reported: LabPoint[] = []
    const smoothed: LabPoint[] = []
    let endedAt: number | null = null
    let failed = false
    let span = startSpan((size / pace) * 1000)
    const draw = () => {
      if (controller.signal.aborted) return
      const now = performance.now()
      /* Once the run is over its clock stops, so nothing past its end moves the axis. */
      const elapsed = (endedAt ?? now) - started
      span = grownSpan(span, Math.max(elapsed, smoothed.at(-1)?.[0] ?? 0))
      setRun((current) => ({
        ...current,
        reported: [...reported],
        smoothed: [...smoothed],
        elapsed,
        span,
      }))
      /* The smoothed bar eases on past the answer: draw until it rests, for two seconds at most. */
      const resting =
        endedAt !== null && (failed || (smoothed.at(-1)?.[1] ?? 1) >= 1 || now - endedAt > 2000)
      if (!resting) live.current.frame = requestAnimationFrame(draw)
    }
    const smooth = smoothProgress<UploadProgress>(({ percent }) => {
      smoothed.push([performance.now() - started, percent])
    })
    setRun({
      phase: "sending",
      size,
      pace,
      reported: [],
      smoothed: [],
      elapsed: 0,
      span,
      answeredAt: null,
      received: null,
      error: null,
    })
    live.current.frame = requestAnimationFrame(draw)
    const form = new FormData()
    form.append("file", new Blob([new Uint8Array(size * MB)]), `upload-lab-${size}mb.bin`)
    try {
      const answer = await labCaller(window.location.origin)
        .lab.with({
          headers: { [LAB_PACE_HEADER]: String(pace) },
          signal: controller.signal,
          onUploadProgress: (progress) => {
            reported.push([performance.now() - started, progress.percent])
            smooth(progress)
          },
        })
        .send(form)
      const answeredAt = performance.now() - started
      setRun((current) => ({ ...current, phase: "done", answeredAt, received: answer.received }))
    } catch (error) {
      if (controller.signal.aborted) return
      failed = true
      setRun((current) => ({ ...current, phase: "failed", error: messageOf(error) }))
    } finally {
      endedAt = performance.now()
    }
  }, [])

  return { run, send }
}
