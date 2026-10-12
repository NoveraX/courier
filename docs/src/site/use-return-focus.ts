"use client"

import type { RefObject } from "react"
import { useRef } from "react"

/** What an overlay's content and its links do with focus, as `useReturnFocus` gives it. */
export interface ReturnFocus {
  /** For the content's `onOpenAutoFocus`: notes what has focus as the overlay opens. */
  remember: () => void
  /** For the content's `onCloseAutoFocus`: gives focus back once the overlay has gone. */
  restore: (event: Event) => void
  /** For a link that closes the overlay: focus stays where the link takes the reader. */
  leave: () => void
}

interface ReturnFocusOptions {
  /** A keyboard shortcut opens the overlay too, from anywhere on the page. */
  shortcut?: boolean
}

/**
 * Gives focus back once a dialog or sheet over the page has closed: to
 * `opener`, the control that opens it — even in Safari, which does not
 * focus a button it clicks. An overlay a shortcut also opens gives focus
 * back to wherever the reader was as it opened, and to `opener` when that
 * has gone; with no `opener`, focus goes back to what had it. An overlay
 * that closes because the reader followed a link in it leaves focus to
 * the page the link leads to.
 *
 * @param opener - The control that opens the overlay
 * @param options - Whether a shortcut opens it too
 * @returns What the overlay's content and its links call
 * @example
 * ```tsx
 * const returnFocus = useReturnFocus(menuButton)
 * <Dialog.Content onOpenAutoFocus={returnFocus.remember} onCloseAutoFocus={returnFocus.restore} />
 * ```
 */
export function useReturnFocus(
  opener?: RefObject<HTMLElement | null>,
  { shortcut = false }: ReturnFocusOptions = {}
): ReturnFocus {
  const focused = useRef<HTMLElement | null>(null)
  const followed = useRef(false)
  return {
    remember: () => {
      const active = document.activeElement
      focused.current = active instanceof HTMLElement && active !== document.body ? active : null
      followed.current = false
    },
    restore: (event) => {
      /* Radix would focus a trigger of its own, and these overlays are not
         opened by one. Like Radix, it leaves the page where it is scrolled. */
      event.preventDefault()
      if (followed.current) return
      const before = focused.current?.isConnected ? focused.current : null
      const target = opener && !shortcut ? opener.current : (before ?? opener?.current)
      target?.focus({ preventScroll: true })
    },
    leave: () => {
      followed.current = true
    },
  }
}
