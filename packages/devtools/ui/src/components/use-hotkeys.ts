import { useEffect } from "react"

type HotkeyHandler = (e: KeyboardEvent) => void

interface HotkeyDef {
  key: string
  meta?: boolean
  shift?: boolean
  alt?: boolean
  handler: HotkeyHandler
}

function matchesHotkey(e: KeyboardEvent, def: HotkeyDef): boolean {
  const metaKey = navigator.userAgent.includes("Mac") ? e.metaKey : e.ctrlKey
  if (def.meta && !metaKey) return false
  if (!def.meta && metaKey) return false
  if (def.shift && !e.shiftKey) return false
  if (def.alt && !e.altKey) return false
  return e.key.toLowerCase() === def.key.toLowerCase()
}

/**
 * Registers global keyboard shortcuts.
 * Ignores events when focus is inside an input, textarea, or contenteditable.
 *
 * @param hotkeys - Array of hotkey definitions
 */
export function useHotkeys(hotkeys: HotkeyDef[]): void {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement
      const isInput =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable

      for (const def of hotkeys) {
        if (!matchesHotkey(e, def)) continue
        // Allow meta shortcuts even in inputs (Cmd+K, etc.)
        if (isInput && !def.meta) continue
        e.preventDefault()
        def.handler(e)
        return
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [hotkeys])
}
