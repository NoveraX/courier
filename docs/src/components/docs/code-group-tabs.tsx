"use client"

import { FileCode } from "lucide-react"
import { useState } from "react"

import { cn } from "@/lib/utils"

import { CopyButton } from "./copy-button"

type CodeGroupTabsProps = {
  labels: string[]
  codes: string[]
  highlighted: string[]
  filenames?: (string | undefined)[]
  className?: string
}

export function CodeGroupTabs({
  labels,
  codes,
  highlighted,
  filenames,
  className,
}: CodeGroupTabsProps) {
  const [activeIndex, setActiveIndex] = useState(0)
  const filename = filenames?.[activeIndex]

  return (
    <div
      data-slot="code-group"
      className={cn(
        "group relative overflow-hidden rounded-lg border border-code-border bg-code-bg glow-code",
        className
      )}
    >
      <div className="flex border-b border-white/[0.06]">
        {labels.map((label, index) => (
          <button
            key={label}
            type="button"
            onClick={() => setActiveIndex(index)}
            className={cn(
              "relative px-4 py-2 text-xs font-medium transition-colors",
              index === activeIndex ? "text-white" : "text-zinc-400 hover:text-zinc-300"
            )}
          >
            {label}
            {index === activeIndex && (
              <span className="absolute inset-x-0 -bottom-px h-0.5 bg-brand" />
            )}
          </button>
        ))}
      </div>
      {filename && (
        <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-2 text-xs text-zinc-400">
          <FileCode className="h-3.5 w-3.5" />
          <span className="font-mono">{filename}</span>
        </div>
      )}
      <div className="relative">
        <CopyButton key={activeIndex} code={codes[activeIndex]} />
        <div
          className="shiki-wrapper overflow-x-auto"
          dangerouslySetInnerHTML={{ __html: highlighted[activeIndex] }}
        />
      </div>
    </div>
  )
}
