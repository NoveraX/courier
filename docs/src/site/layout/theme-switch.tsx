"use client"

import type { LucideIcon } from "lucide-react"
import { Monitor, Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import { useEffect, useId, useState } from "react"

import { cn } from "@/site/cn"

const OPTIONS: readonly { id: string; label: string; icon: LucideIcon }[] = [
  { id: "system", label: "System theme", icon: Monitor },
  { id: "light", label: "Light theme", icon: Sun },
  { id: "dark", label: "Dark theme", icon: Moon },
]

const SIZE = {
  header: {
    group: "h-7.5 rounded-full bg-panel p-0.5",
    option: "size-6 rounded-full",
    icon: "size-3.25",
  },
  drawer: {
    group: "h-9 rounded-full bg-panel p-0.75",
    option: "size-7.5 rounded-full",
    icon: "size-3.5",
  },
  menu: {
    group: "h-11 rounded-[10px] bg-bg-subtle p-1",
    option: "size-8.5 rounded-[7px]",
    icon: "size-3.5",
  },
} as const

/**
 * The colour theme: as the system has it, light or dark — kept between
 * visits, picked with the arrow keys like any set of radio buttons.
 * Nothing is shown as picked until the page knows the stored choice, so
 * the server's render never claims one.
 *
 * @param props - Where it sits, which sets its size
 * @returns The switch
 * @example
 * ```tsx
 * <ThemeSwitch size="header" />
 * ```
 */
export function ThemeSwitch({ size }: { size: keyof typeof SIZE }) {
  const { theme, setTheme } = useTheme()
  const [known, setKnown] = useState(false)
  const name = useId()
  useEffect(() => setKnown(true), [])
  const look = SIZE[size]
  return (
    <fieldset
      aria-label="Colour theme"
      className={cn("m-0 flex items-center gap-0.5 border border-line", look.group)}
    >
      {OPTIONS.map(({ id, label, icon: Icon }) => {
        const on = known && theme === id
        return (
          <label
            key={id}
            title={label}
            className={cn(
              "grid cursor-pointer place-items-center transition-colors hover:text-fg has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-brand",
              look.option,
              on ? "bg-raised text-fg shadow-panel" : "text-fg-subtle"
            )}
          >
            <input
              type="radio"
              name={name}
              value={id}
              checked={on}
              onChange={() => setTheme(id)}
              aria-label={label}
              className="sr-only"
            />
            <Icon aria-hidden="true" className={look.icon} />
          </label>
        )
      })}
    </fieldset>
  )
}
