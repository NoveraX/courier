"use client"

import { useId, useState } from "react"

import { cn } from "@/site/cn"
import { CodeBody } from "./code-body"
import { CopyButton } from "./copy-button"

/** One tab of a tabbed code panel, highlighted on the server. */
export interface CodeTab {
  label: string
  code: string
  html: string
}

/**
 * Code in tabs — one per package manager, framework or variant — with a
 * Copy button for the tab shown.
 *
 * @param props - The tabs, each highlighted
 * @returns The panel
 * @example
 * ```tsx
 * <CodeTabs tabs={[{ label: "npm", code, html }]} />
 * ```
 */
export function CodeTabs({ tabs }: { tabs: readonly CodeTab[] }) {
  const [shown, setShown] = useState(0)
  const id = useId()
  const tab = tabs[shown] ?? tabs[0]
  if (!tab) return null
  return (
    <div
      data-slot="code-panel"
      className="overflow-hidden rounded-panel border border-line bg-panel shadow-panel"
    >
      <div className="flex h-10 items-center gap-0.5 border-b border-line bg-bg-subtle px-2">
        <div
          role="tablist"
          className="flex min-w-0 items-center gap-0.5 overflow-x-auto overflow-y-hidden"
        >
          {tabs.map((t, i) => (
            <button
              key={t.label}
              type="button"
              role="tab"
              id={`${id}-tab-${i}`}
              aria-selected={i === shown}
              aria-controls={`${id}-panel`}
              onClick={() => setShown(i)}
              className={cn(
                "h-6.5 shrink-0 cursor-pointer rounded-chip px-2.5 font-mono text-label whitespace-nowrap transition-colors focus-visible:-outline-offset-2",
                i === shown ? "bg-raised text-fg" : "text-fg-subtle hover:text-fg"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <CopyButton text={tab.code} className="ml-auto" />
      </div>
      <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-tab-${shown}`}>
        <CodeBody html={tab.html} />
      </div>
    </div>
  )
}
