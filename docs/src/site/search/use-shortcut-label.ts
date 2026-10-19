"use client"

import { useSyncExternalStore } from "react"

const APPLE = /Mac|iPhone|iPad|iPod/

function subscribe(): () => void {
  return () => {}
}

function platformLabel(): string {
  return APPLE.test(navigator.platform || navigator.userAgent) ? "⌘K" : "Ctrl K"
}

/* The page is rendered before the reader's platform is known; it reads ⌘K
   until the browser says otherwise. */
function renderedLabel(): string {
  return "⌘K"
}

/**
 * The search shortcut as the reader's keyboard names it: ⌘K on Apple's
 * devices, Ctrl K elsewhere.
 *
 * @returns The label
 * @example
 * ```tsx
 * <kbd>{useShortcutLabel()}</kbd>
 * ```
 */
export function useShortcutLabel(): string {
  return useSyncExternalStore(subscribe, platformLabel, renderedLabel)
}
