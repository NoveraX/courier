"use client"

import { useState } from "react"
import type { CodeToken } from "@/site/code/highlight-tokens"
import { copyText } from "@/site/copy-text"
import { CommandWords } from "@/site/landing/command-words"
import { PageLink } from "@/site/landing/page-link"
import { START_COMMAND } from "@/site/landing/start-command"
import { useInView } from "@/site/landing/use-in-view"
import { useReducedMotion } from "@/site/landing/use-reduced-motion"
import { useTicker } from "@/site/landing/use-ticker"
import { useFlash } from "@/site/use-flash"
import { AdapterCode } from "./adapter-code"
import { AdapterList } from "./adapter-list"
import type { Adapter } from "./adapters"

/** An adapter with its mark and its code highlighted. */
export interface ShownAdapter extends Adapter {
  icon: string
  lines: CodeToken[][]
}

/* Each adapter shows for 5.2 s, counted in tenths of a second. */
const TURN = 52

/**
 * The adapters beside one adapter's code. The list moves on by itself every
 * few seconds while it is on screen — holding still while the pointer or
 * the focus is on it — until the reader picks one. The code shows the
 * mount, its length, the guide to its framework, and the one command that
 * sets Courier up with it — in a project of that framework, or a new one.
 *
 * @param props - The adapters shown, and how many official adapters there are in all
 * @returns The picker
 * @example
 * ```tsx
 * <AdapterPicker adapters={adapters} total={10} />
 * ```
 */
export function AdapterPicker({
  adapters,
  total,
}: {
  adapters: readonly ShownAdapter[]
  total: number
}) {
  const [ref, inView] = useInView<HTMLElement>(0.25)
  const still = useReducedMotion()
  const [chosen, setChosen] = useState<number | null>(null)
  const [held, setHeld] = useState({ pointer: false, focus: false })
  const moving = !still && chosen === null
  const running = moving && inView && !held.pointer && !held.focus
  const tick = useTicker(running, 100)
  const turn = Math.floor(tick / TURN)
  const picked = chosen ?? turn % adapters.length
  const adapter = adapters[picked] ?? adapters[0]
  const [copied, flash] = useFlash()
  if (!adapter) return null
  const command = `${START_COMMAND} --framework ${adapter.framework}`
  return (
    <section
      ref={ref}
      aria-label="Framework adapters"
      onPointerEnter={() => setHeld((h) => ({ ...h, pointer: true }))}
      onPointerLeave={() => setHeld((h) => ({ ...h, pointer: false }))}
      onFocus={() => setHeld((h) => ({ ...h, focus: true }))}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          setHeld((h) => ({ ...h, focus: false }))
      }}
      className="grid grid-cols-1 overflow-hidden rounded-[14px] border border-line bg-panel min-[900px]:grid-cols-[minmax(0,240px)_minmax(0,1fr)]"
    >
      <div className="flex min-w-0 flex-col border-b border-line bg-bg-subtle min-[900px]:border-r min-[900px]:border-b-0">
        <div className="hidden h-10.5 items-center border-b border-line px-4 font-mono text-micro tracking-[0.08em] text-fg-subtle min-[900px]:flex">
          ADAPTER
        </div>
        <AdapterList
          adapters={adapters}
          picked={picked}
          turn={moving ? turn : null}
          running={running}
          total={total}
          onPick={setChosen}
        />
      </div>
      <section aria-label={`${adapter.label} adapter`} className="flex min-w-0 flex-col">
        <div className="flex min-h-10.5 min-w-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-line px-4 py-2">
          <span className="min-w-0 truncate font-mono text-label tracking-normal text-fg">
            {adapter.file}
          </span>
          <span className="shrink-0 font-mono text-[11px] tracking-normal text-fg-subtle">
            {adapter.lines.length} lines
          </span>
          <PageLink
            href={adapter.guide}
            className="-my-1 ml-auto shrink-0 py-1 text-[12.5px] whitespace-nowrap text-fg-muted transition-colors hover:text-fg"
          >
            {adapter.label} guide <span aria-hidden="true">→</span>
          </PageLink>
        </div>
        <AdapterCode adapter={adapter} lines={adapter.lines} />
        <div className="flex min-h-11.5 min-w-0 items-center gap-3 border-t border-line py-2 pr-2 pl-4 font-mono text-label tracking-normal">
          <span className="text-fg-subtle">$</span>
          <span className="min-w-0 flex-1 text-fg-muted">
            <CommandWords
              command={command}
              toneOf={(_, at, words) => (at === words.length - 1 ? "text-fg" : undefined)}
            />
          </span>
          <button
            type="button"
            onClick={async () => flash(await copyText(command))}
            className="h-7.5 shrink-0 cursor-pointer rounded-control border border-line bg-bg-subtle px-3 font-mono text-[11px] text-fg-muted transition-colors hover:border-line-strong hover:text-fg"
          >
            {copied ? "copied" : "copy"}
          </button>
        </div>
      </section>
    </section>
  )
}
