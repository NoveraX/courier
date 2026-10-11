"use client"

import { useState } from "react"

import { cn } from "@/site/cn"
import { CodeLines } from "@/site/code/code-lines"
import type { CodeToken } from "@/site/code/highlight-tokens"
import { copyText } from "@/site/copy-text"
import { useFlash } from "@/site/use-flash"
import type { SetupTarget } from "./setup-targets"

/** A place to set the server up, its code highlighted. */
export type ShownTarget = SetupTarget & { lines: readonly CodeToken[][] }

/**
 * The MCP server's setup, one tab per place it runs: the lines that set it
 * up there, where they go, and a button that copies them.
 *
 * @param props - The places, their code highlighted
 * @returns The tabs
 * @example
 * ```tsx
 * <SetupTabs targets={targets} />
 * ```
 */
export function SetupTabs({ targets }: { targets: readonly ShownTarget[] }) {
  const [chosen, setChosen] = useState(0)
  const [copied, flash] = useFlash()
  const target = targets[chosen] ?? targets[0]
  if (!target) return null
  return (
    <div className="relative overflow-hidden rounded-2xl border border-line bg-panel shadow-(--studio-shadow)">
      {/* The rule under the tabs is a shadow inside the strip, which the chosen tab covers: a border the tab overlapped would make the strip scroll. */}
      <div
        role="tablist"
        aria-label="Where to set it up"
        className="flex gap-1 overflow-x-auto overflow-y-hidden bg-bg-subtle px-2.5 pt-2 shadow-[inset_0_-1px_0_var(--color-line)] [scrollbar-width:none]"
      >
        {targets.map((option, at) => (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={at === chosen}
            onClick={() => setChosen(at)}
            className={cn(
              "shrink-0 cursor-pointer rounded-t-[8px] border border-b-0 px-3.5 py-2 text-[13px] transition-colors focus-visible:-outline-offset-2",
              at === chosen
                ? "border-line bg-panel text-fg"
                : "border-transparent text-fg-muted hover:text-fg"
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="grid gap-3 p-4.5">
        <div className="flex items-center gap-3">
          <span className="font-mono text-[11px] text-fg-subtle">{target.file}</span>
          <button
            type="button"
            onClick={async () => flash(await copyText(target.code))}
            className="ml-auto cursor-pointer rounded-[6px] border border-line px-2.5 py-1 font-mono text-[11px] text-fg-muted hover:border-line-strong hover:text-fg"
          >
            {copied ? "copied" : "copy"}
          </button>
        </div>
        <div className="overflow-x-auto rounded-[10px] border border-line bg-bg-subtle">
          <CodeLines
            lines={target.lines}
            className="m-0 px-4 py-3.5 text-label leading-[1.75] text-code-plain"
          />
        </div>
        <p className="m-0 text-nav text-fg-muted">{target.note}</p>
      </div>
    </div>
  )
}
