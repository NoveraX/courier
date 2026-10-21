"use client"

import { cn } from "@/site/cn"
import { askConsent } from "./use-consent"

/**
 * Cookie settings, in a footer: asks the reader again whether the site may
 * count their visits, and takes focus back once they answer. It changes
 * the page rather than leaving it, so it is a button set as the links
 * beside it are, down to their letter spacing, which the site's base
 * styles otherwise reset for controls.
 *
 * @param props - The class of the footer's links
 * @returns The button
 * @example
 * ```tsx
 * <CookieSettingsButton className="-my-1 py-1 hover:text-fg" />
 * ```
 */
export function CookieSettingsButton({ className }: { className: string }) {
  return (
    <button
      type="button"
      onClick={(event) => askConsent(event.currentTarget)}
      className={cn(className, "cursor-pointer [letter-spacing:inherit]")}
    >
      Cookie settings
    </button>
  )
}
