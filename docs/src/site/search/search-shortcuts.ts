/** What a key does to search: ⌘K and Ctrl+K open or close it; `/` opens it. */
export type SearchShortcut = "toggle" | "open"

/** The parts of a key press a shortcut is read from. */
export interface ShortcutKey {
  key: string
  metaKey: boolean
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
  isComposing?: boolean
  /** What the key was pressed in: an element, as the browser hands it over. */
  target: unknown
}

const FIELDS: ReadonlySet<string> = new Set(["INPUT", "TEXTAREA", "SELECT"])

function isWriting(target: unknown): boolean {
  if (typeof target !== "object" || target === null) return false
  if ("isContentEditable" in target && target.isContentEditable === true) return true
  return "tagName" in target && typeof target.tagName === "string" && FIELDS.has(target.tagName)
}

/**
 * What a key press does to search: ⌘K, or Ctrl+K, opens it from anywhere
 * and closes it again; `/` opens it unless the reader is typing in a
 * field. A key pressed while an input method composes a character is the
 * character's.
 *
 * @param event - The key press
 * @returns The shortcut, or `null` for any other key
 * @example
 * ```ts
 * window.addEventListener("keydown", (event) => searchShortcutOf(event) && event.preventDefault())
 * ```
 */
export function searchShortcutOf(event: ShortcutKey): SearchShortcut | null {
  if (event.isComposing) return null
  const command = event.metaKey || event.ctrlKey
  if (command && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "k")
    return "toggle"
  if (event.key === "/" && !command && !event.altKey && !isWriting(event.target)) return "open"
  return null
}
