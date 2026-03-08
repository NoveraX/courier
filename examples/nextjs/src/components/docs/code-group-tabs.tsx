"use client"

import { useState } from "react"

import { cn } from "@/lib/utils"

import { CopyButton } from "./copy-button"

type CodeGroupTabsProps = {
  labels: string[]
  codes: string[]
  highlighted: string[]
  className?: string
}

export function CodeGroupTabs({ labels, codes, highlighted, className }: CodeGroupTabsProps) {
  const [activeIndex, setActiveIndex] = useState(0)

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
