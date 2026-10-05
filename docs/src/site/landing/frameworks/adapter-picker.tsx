"use client"

import { useState } from "react"
import { cn } from "@/site/cn"
import type { CodeToken } from "@/site/code/highlight-tokens"
import { copyText } from "@/site/copy-text"
import { BrandIcon } from "@/site/landing/brand-icon"
import { useInView } from "@/site/landing/use-in-view"
import { useReducedMotion } from "@/site/landing/use-reduced-motion"
import { useTicker } from "@/site/landing/use-ticker"
import { useFlash } from "@/site/use-flash"
import { AdapterCode } from "./adapter-code"
import type { Adapter } from "./adapters"

/** An adapter with its mark and its code highlighted. */
export interface ShownAdapter extends Adapter {
  icon: string
  lines: CodeToken[][]
}

/* Each adapter shows for 5.2 s, counted in tenths of a second. */
const TURN = 52

/**
 * The adapters beside one adapter's code: the list moves on by itself every
 * few seconds while it is on screen, until the reader picks one; the code
 * shows the mount, its length, and the command that installs it.
 *
 * @param props - The adapters
 * @returns The picker
 * @example
 * ```tsx
 * <AdapterPicker adapters={adapters} />
 * ```
 */
export function AdapterPicker({ adapters }: { adapters: readonly ShownAdapter[] }) {
  const [ref, inView] = useInView<HTMLDivElement>(0.25)
  const still = useReducedMotion()
  const [chosen, setChosen] = useState<number | null>(null)
  const running = inView && !still && chosen === null
  const tick = useTicker(running, 100)
  const turn = Math.floor(tick / TURN)
  const picked = chosen ?? turn % adapters.length
  const adapter = adapters[picked] ?? adapters[0]
  const [copied, flash] = useFlash()
  if (!adapter) return null
  return (
    <div
      ref={ref}
      className="grid grid-cols-1 overflow-hidden rounded-[14px] border border-line bg-panel min-[900px]:grid-cols-[minmax(0,300px)_minmax(0,1fr)]"
    >
      <div className="flex min-w-0 flex-col border-b border-line bg-bg-subtle min-[900px]:border-r min-[900px]:border-b-0">
        <div className="hidden h-10.5 items-center border-b border-line px-4 font-mono text-micro tracking-[0.08em] text-fg-subtle min-[900px]:flex">
          ADAPTER
        </div>
        <fieldset className="m-0 flex min-w-0 overflow-x-auto border-0 p-0 [scrollbar-width:none] min-[900px]:grid min-[900px]:grid-cols-2 min-[900px]:overflow-visible">
          <legend className="sr-only">Adapters</legend>
          {adapters.map((item, at) => {
            const on = at === picked
            return (
              <button
                key={item.label}
                type="button"
                aria-pressed={on}
                onClick={() => setChosen(at)}
                className={cn(
                  "relative flex h-12 shrink-0 cursor-pointer items-center gap-3 border-r border-line px-4 text-left whitespace-nowrap transition-colors duration-200 hover:bg-panel min-[900px]:h-14 min-[900px]:border-b min-[900px]:[&:nth-of-type(even)]:border-r-0",
                  on ? "bg-panel" : "bg-transparent"
                )}
              >
                <span
                  className={cn(
                    "absolute inset-y-0 left-0 w-0.5 transition-colors",
                    on ? "bg-fg" : "bg-transparent"
                  )}
                />
                <span
                  className={cn(
                    "text-fg transition-opacity duration-200",
                    on ? "opacity-100" : "opacity-42"
                  )}
                >
                  <BrandIcon path={item.icon} className="block size-4.5" />
                </span>
                <span
                  className={cn(
                    "min-w-0 flex-1 text-[14px] tracking-[-0.015em]",
                    on ? "text-fg" : "text-fg-muted"
                  )}
                >
                  {item.label}
                </span>
                {on && chosen === null && !still && (
                  <span
                    key={turn}
                    aria-hidden="true"
                    className="absolute inset-x-0 -bottom-px h-px origin-left animate-fill bg-fg-muted will-change-transform"
                    style={{ animationPlayState: running ? "running" : "paused" }}
                  />
                )}
              </button>
            )
          })}
        </fieldset>
      </div>
      <section aria-label={`${adapter.label} adapter`} className="flex min-w-0 flex-col">
        <div className="flex h-10.5 min-w-0 items-center gap-3 border-b border-line px-4">
          <span className="truncate font-mono text-label tracking-normal text-fg">
            {adapter.file}
          </span>
          <span className="ml-auto shrink-0 font-mono text-[11px] tracking-normal text-fg-subtle">
            {adapter.lines.length} lines
          </span>
        </div>
        <AdapterCode adapter={adapter} lines={adapter.lines} />
        <div className="flex min-h-11.5 min-w-0 items-center gap-3 border-t border-line py-2 pr-2 pl-4 font-mono text-label tracking-normal">
          <span className="text-fg-subtle">$</span>
          <span className="min-w-0 flex-1 truncate text-fg-muted">
            npm i <span className="text-fg">{adapter.pkg}</span>
          </span>
          <button
            type="button"
            onClick={async () => flash(await copyText(`npm i ${adapter.pkg}`))}
            className="h-7.5 shrink-0 cursor-pointer rounded-control border border-line bg-bg-subtle px-3 font-mono text-[11px] text-fg-muted transition-colors hover:border-line-strong hover:text-fg"
          >
            {copied ? "copied" : "copy"}
          </button>
        </div>
      </section>
    </div>
  )
}
