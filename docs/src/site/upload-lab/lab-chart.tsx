"use client"

import { useId } from "react"

import { chartScale, linePath, stepPath, timeTicks } from "./lab-geometry"
import { useElementWidth } from "./use-element-width"
import type { LabRun } from "./use-upload-lab"

const SHARES = [0, 0.25, 0.5, 0.75, 1]

/**
 * The run over time: the browser's reports as steps, each marked, and
 * smoothProgress's moves as a lit line over the same reports — with the
 * site's answer dashed and, while the upload goes, where it is now.
 *
 * @param props - The run
 * @returns The chart
 * @example
 * ```tsx
 * <LabChart run={run} />
 * ```
 */
export function LabChart({ run }: { run: LabRun }) {
  const [ref, width] = useElementWidth<HTMLDivElement>()
  /* React's ids carry characters a `url(#…)` reference may not take in every browser. */
  const area = `lab-area-${useId().replace(/[^\w-]/g, "")}`
  const height = width < 520 ? 220 : 250
  const scale = chartScale({ width, height, left: 44, right: 14, top: 18, bottom: 30 }, run.span)
  const line = linePath(run.smoothed, scale, false)
  const summary = `Share sent over time: the browser reported ${run.reported.length} times, smoothProgress moved the bar ${run.smoothed.length} times.`
  return (
    <div ref={ref} className="relative w-full" style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={summary} className="block">
          <defs>
            <linearGradient id={area} x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0%"
                className="[stop-color:var(--color-tone-blue)]"
                stopOpacity="0.26"
              />
              <stop offset="100%" className="[stop-color:var(--color-tone-blue)]" stopOpacity="0" />
            </linearGradient>
          </defs>
          {SHARES.map((share) => (
            <g key={share}>
              <line
                x1={scale.x(0)}
                x2={scale.x(scale.span)}
                y1={scale.y(share)}
                y2={scale.y(share)}
                className="stroke-line"
              />
              <text x={8} y={scale.y(share) + 3.5} className="fill-fg-subtle font-mono text-micro">
                {share * 100}%
              </text>
            </g>
          ))}
          {timeTicks(scale.span, scale.x(scale.span) - scale.x(0)).map((ms) => (
            <text
              key={ms}
              x={scale.x(ms)}
              y={height - 9}
              textAnchor={ms === 0 ? "start" : ms === scale.span ? "end" : "middle"}
              className="fill-fg-subtle font-mono text-micro"
            >
              {ms / 1000} s
            </text>
          ))}
          <path d={linePath(run.smoothed, scale, true)} fill={`url(#${area})`} />
          <path
            d={line}
            className="fill-none stroke-tone-blue opacity-25"
            strokeWidth={7}
            strokeLinejoin="round"
          />
          <path
            d={line}
            className="fill-none stroke-tone-blue"
            strokeWidth={2}
            strokeLinejoin="round"
          />
          <path
            d={stepPath(run.reported, run.answeredAt ?? run.elapsed, scale)}
            className="fill-none stroke-tone-amber"
            strokeWidth={1.5}
          />
          {run.reported.map(([ms, share]) => (
            <circle
              key={`${ms}-${share}`}
              cx={scale.x(ms)}
              cy={scale.y(share)}
              r={2.6}
              className="fill-tone-amber stroke-panel"
              strokeWidth={1.5}
            />
          ))}
          {run.answeredAt !== null && (
            <g className="stroke-fg-subtle">
              <line
                x1={scale.x(run.answeredAt)}
                x2={scale.x(run.answeredAt)}
                y1={scale.y(1) - 8}
                y2={scale.y(0)}
                strokeDasharray="3 4"
              />
              <text
                x={scale.x(run.answeredAt) - 6}
                y={scale.y(1) - 6}
                textAnchor="end"
                className="fill-fg-subtle stroke-none font-mono text-micro"
              >
                answer
              </text>
            </g>
          )}
          {run.phase === "sending" && (
            <line
              x1={scale.x(run.elapsed)}
              x2={scale.x(run.elapsed)}
              y1={scale.y(1)}
              y2={scale.y(0)}
              className="stroke-fg-muted opacity-30"
            />
          )}
        </svg>
      )}
    </div>
  )
}
