"use client"

import { useEffect, useRef } from "react"

/**
 * How far down the page the reader is, as a thin bar along the top of the
 * window.
 *
 * @returns The bar
 * @example
 * ```tsx
 * <ReadingProgress />
 * ```
 */
export function ReadingProgress() {
  const bar = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const update = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight
      const share = max > 0 ? Math.min(1, window.scrollY / max) : 0
      if (bar.current) bar.current.style.width = `${share * 100}%`
    }
    update()
    window.addEventListener("scroll", update, { passive: true })
    window.addEventListener("resize", update)
    return () => {
      window.removeEventListener("scroll", update)
      window.removeEventListener("resize", update)
    }
  }, [])
  return (
    <div
      ref={bar}
      aria-hidden="true"
      className="fixed top-0 left-0 z-90 h-0.5 w-0 bg-brand transition-[width] duration-100 ease-linear"
    />
  )
}
