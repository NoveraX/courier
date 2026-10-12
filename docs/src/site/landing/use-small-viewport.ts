"use client"

import { useEffect, useState } from "react"

/** The room the window gives a page: its width, and its height with a phone's toolbars shown. */
export interface ViewportRoom {
  width: number
  height: number
}

/* An element as tall as the small viewport, 100svh: unlike innerHeight it holds still while a
   phone's toolbars slide away and back, so a resize observer on it fires only when the window
   itself changes. It is as wide as the window too, so a window resized only across is seen. */
const PROBE =
  "position:fixed;top:0;left:0;width:100%;height:100svh;visibility:hidden;pointer-events:none"

function measure(probe: HTMLElement): ViewportRoom {
  return { width: window.innerWidth, height: probe.offsetHeight || window.innerHeight }
}

/**
 * The window's width, and its small height — the height it has with a
 * phone's toolbars shown. While the page scrolls, a phone's browser slides
 * its toolbars away and back and `innerHeight` follows them; the small
 * height does not, so whatever is sized by it stays put mid-scroll and
 * changes only when the window does: turned, or resized on a desktop.
 *
 * @returns The width and the small height, in px
 * @example
 * ```ts
 * const { width, height } = useSmallViewport()
 * ```
 */
export function useSmallViewport(): ViewportRoom {
  const [room, setRoom] = useState<ViewportRoom>({ width: 1200, height: 900 })
  useEffect(() => {
    const probe = document.createElement("div")
    probe.setAttribute("aria-hidden", "true")
    probe.style.cssText = PROBE
    document.body.append(probe)
    const update = () => {
      const next = measure(probe)
      setRoom((last) => (last.width === next.width && last.height === next.height ? last : next))
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(probe)
    return () => {
      observer.disconnect()
      probe.remove()
    }
  }, [])
  return room
}
