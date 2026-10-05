"use client"

import { useEffect } from "react"

/**
 * Open search with ⌘K, or Ctrl+K, from anywhere on the page.
 *
 * @param setOpen - The setter of whether search is open, as `useState` gives it
 * @example
 * ```ts
 * const [searching, setSearching] = useState(false)
 * useSearchShortcut(setSearching)
 * ```
 */
export function useSearchShortcut(setOpen: (open: boolean) => void): void {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        setOpen(true)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [setOpen])
}
