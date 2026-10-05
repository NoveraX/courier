"use client"

import { cn } from "@/site/cn"
import { copyText } from "@/site/copy-text"
import { useFlash } from "@/site/use-flash"

/** The command that installs Courier. */
export const INSTALL_COMMAND = "npm i @noverax/courier"

const LOOK = {
  studio: {
    button:
      "h-11 max-w-full gap-3 rounded-[10px] bg-panel px-3.5 text-control text-fg-muted hover:text-fg max-[560px]:gap-2 max-[560px]:text-[11.5px]",
    label: "min-w-10 text-right text-[11px] text-brand",
  },
  hero: {
    button: "h-10.5 gap-3 rounded-[9px] bg-panel px-3.5 text-control text-fg-muted hover:text-fg",
    label: "min-w-8.5 text-right text-[11px] text-brand",
  },
  footer: {
    button:
      "h-9 gap-2.5 self-start rounded-control bg-panel px-3 text-label text-fg-muted hover:text-fg",
    label: "text-micro text-brand",
  },
  menu: {
    button: "h-11 w-full gap-2.5 rounded-[10px] bg-bg-subtle pr-3 pl-3.5 text-small text-fg",
    label: "rounded-[5px] border border-line px-1.5 py-0.5 text-micro text-fg-subtle",
  },
} as const

/**
 * An install command as a button: a click copies it, and the button says
 * so for a moment.
 *
 * @param props - Where it sits, which sets its size; and the command, Courier's by default
 * @returns The button
 * @example
 * ```tsx
 * <InstallButton look="hero" />
 * ```
 */
export function InstallButton({
  look,
  command = INSTALL_COMMAND,
}: {
  look: keyof typeof LOOK
  command?: string
}) {
  const [copied, flash] = useFlash()
  const style = LOOK[look]
  return (
    <button
      type="button"
      onClick={async () => flash(await copyText(command))}
      className={cn(
        "flex cursor-pointer items-center border border-line text-left font-mono transition-colors hover:border-line-strong",
        style.button
      )}
    >
      <span className="text-fg-subtle">$</span>
      <span className={cn("min-w-0 truncate", look === "menu" && "flex-1")}>{command}</span>
      <span aria-live="polite" className={style.label}>
        {copied ? "copied" : "copy"}
      </span>
    </button>
  )
}
