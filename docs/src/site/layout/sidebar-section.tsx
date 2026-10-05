"use client"

import Link from "next/link"

import { cn } from "@/site/cn"
import type { NavSection } from "@/site/content/docs-nav"

interface SidebarSectionProps {
  section: NavSection
  /** The address of the page shown, as the navigation writes it. */
  current: string
  open: boolean
  onToggle: () => void
}

/**
 * A section of the docs navigation: its icon and name, how many pages it
 * holds, a toggle that folds it, and its pages — the one shown marked.
 *
 * @param props - The section, the page shown, whether it is open, and what folds it
 * @returns The section
 * @example
 * ```tsx
 * <SidebarSection section={section} current="/docs/quick-start" open onToggle={toggle} />
 * ```
 */
export function SidebarSection({ section, current, open, onToggle }: SidebarSectionProps) {
  const { icon: Icon } = section
  const active = section.items.some((item) => item.href === current)
  return (
    <div className="mt-2.5">
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="mb-1 flex h-7.5 w-full cursor-pointer items-center gap-2.25 rounded-[7px] px-2 text-left hover:bg-panel"
      >
        <span
          className={cn(
            "grid size-5 shrink-0 place-items-center rounded-chip border",
            active ? "border-brand/30 bg-brand/12 text-brand" : "border-line bg-panel text-fg-muted"
          )}
        >
          <Icon aria-hidden="true" className="size-3" />
        </span>
        <span className="flex-1 text-small font-semibold tracking-[-0.01em] text-fg">
          {section.label}
        </span>
        <span className="font-mono text-micro tracking-normal text-fg-subtle">
          {section.items.length}
        </span>
        <span
          aria-hidden="true"
          className="relative grid size-4 shrink-0 place-items-center rounded-[5px] border border-line bg-bg-subtle"
        >
          <span className="absolute h-[1.5px] w-2 rounded-[1px] bg-fg-subtle" />
          <span
            className={cn(
              "absolute h-2 w-[1.5px] rounded-[1px] bg-fg-subtle transition-transform duration-250 ease-[cubic-bezier(.16,1,.3,1)]",
              open && "scale-y-0 rotate-90"
            )}
          />
        </span>
      </button>
      <div
        className={cn(
          "grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(.16,1,.3,1)]",
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <ul className="relative m-0 ml-4.5 flex list-none flex-col gap-px border-l border-line p-0 pb-0.5 pl-2.5">
            {section.items.map((item) => {
              const on = item.href === current
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    tabIndex={open ? undefined : -1}
                    aria-current={on ? "page" : undefined}
                    className={cn(
                      "relative flex min-h-7.5 items-center gap-2 rounded-[7px] border px-2.5 text-nav transition-colors hover:bg-panel hover:text-fg",
                      on
                        ? "border-line bg-panel font-medium text-fg"
                        : "border-transparent text-fg-muted"
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        "absolute inset-y-1.75 -left-3 w-0.5 rounded-xs",
                        on ? "bg-brand" : "bg-transparent"
                      )}
                    />
                    {item.title}
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      </div>
    </div>
  )
}
