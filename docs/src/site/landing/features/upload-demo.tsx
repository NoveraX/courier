"use client"

import { FileArchive } from "lucide-react"

import { cn } from "@/site/cn"
import { useFeatureTime } from "./feature-clock"
import { UPLOAD_CYCLE, UPLOAD_SIZE_MB, uploadFrame } from "./upload-frame"

const BARS = Array.from({ length: 32 }, (_, at) => ({
  key: `bar-${at}`,
  height: `${30 + ((at * 37) % 70)}%`,
}))

/**
 * An upload reporting its progress: the file with the share and the
 * megabytes sent, a row of bars filling as it goes, and its speed.
 *
 * @returns The demo
 * @example
 * ```tsx
 * <UploadDemo />
 * ```
 */
export function UploadDemo() {
  const { tick, still } = useFeatureTime()
  const { percent, speed } = uploadFrame(still ? UPLOAD_CYCLE - 1 : tick)
  const lit = Math.round((percent / 100) * BARS.length)
  return (
    <div className="mx-auto flex max-w-[460px] flex-col gap-3.5">
      <div className="flex items-center gap-3 rounded-[11px] border border-line-strong bg-raised px-3.5 py-3">
        <div className="grid size-8.5 shrink-0 place-items-center rounded-control bg-[rgb(var(--tone-rgb)/0.12)] text-(--tone)">
          <FileArchive aria-hidden="true" className="size-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-nav text-fg">release-assets.zip</div>
          <div className="mt-0.75 font-mono text-[11px] text-fg-subtle">
            {((UPLOAD_SIZE_MB * percent) / 100).toFixed(1)} / {UPLOAD_SIZE_MB} MB
          </div>
        </div>
        <div className="font-mono text-[15px] text-(--tone) tabular-nums">{percent}%</div>
      </div>
      <div aria-hidden="true" className="grid h-11.5 grid-cols-32 items-end gap-0.75">
        {BARS.map((bar, at) => (
          <span
            key={bar.key}
            className={cn(
              "block rounded-xs transition-colors duration-200",
              at < lit ? "bg-(--tone)" : "bg-raised"
            )}
            style={{ height: bar.height }}
          />
        ))}
      </div>
      <div className="flex justify-between font-mono text-micro text-fg-subtle">
        <span>XHR · multipart/form-data</span>
        <span>{speed === null ? "done" : `${speed.toFixed(1)} MB/s`}</span>
      </div>
    </div>
  )
}
