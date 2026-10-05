"use client"

import { useCallback, useEffect, useState } from "react"

/* How long a control says it did what it was asked. */
const FLASH_MS = 1600

/**
 * A moment of "done" for a control — Copied, Saved — that clears itself.
 *
 * @returns Whether it is showing, and what shows it when an action worked
 * @example
 * ```tsx
 * const [copied, flash] = useFlash()
 * <button onClick={async () => flash(await copyText(code))}>{copied ? "Copied" : "Copy"}</button>
 * ```
 */
export function useFlash(): [boolean, (worked: boolean) => void] {
  const [on, setOn] = useState(false)
  useEffect(() => {
    if (!on) return
    const timer = setTimeout(() => setOn(false), FLASH_MS)
    return () => clearTimeout(timer)
  }, [on])
  return [on, useCallback((worked: boolean) => setOn(worked), [])]
}
