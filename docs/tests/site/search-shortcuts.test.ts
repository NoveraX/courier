/**
 * ⌘K, or Ctrl+K, opens search from anywhere and closes it again; `/` opens
 * it unless the reader is typing in a field; a key an input method is
 * composing a character with is the character's.
 */
import { describe, expect, it } from "vitest"

import type { ShortcutKey } from "@/site/search/search-shortcuts"
import { searchShortcutOf } from "@/site/search/search-shortcuts"

function press(key: string, held: Partial<ShortcutKey> = {}): ShortcutKey {
  return {
    key,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    target: null,
    ...held,
  }
}

const field = (tagName: string) => ({ tagName, isContentEditable: false })
const editable = { tagName: "DIV", isContentEditable: true }

describe("search's shortcuts", () => {
  it("opens and closes search with ⌘K and Ctrl+K, in any case", () => {
    expect(searchShortcutOf(press("k", { metaKey: true }))).toBe("toggle")
    expect(searchShortcutOf(press("k", { ctrlKey: true }))).toBe("toggle")
    expect(searchShortcutOf(press("K", { metaKey: true }))).toBe("toggle")
  })

  it("does so even while the reader types in a field", () => {
    expect(searchShortcutOf(press("k", { metaKey: true, target: field("INPUT") }))).toBe("toggle")
  })

  it("leaves ⌘K with another modifier, and K alone, to the page", () => {
    expect(searchShortcutOf(press("k", { metaKey: true, shiftKey: true }))).toBeNull()
    expect(searchShortcutOf(press("k", { ctrlKey: true, altKey: true }))).toBeNull()
    expect(searchShortcutOf(press("k"))).toBeNull()
  })

  it("opens search with / where nothing is being typed", () => {
    expect(searchShortcutOf(press("/"))).toBe("open")
    expect(searchShortcutOf(press("/", { target: field("BUTTON") }))).toBe("open")
    expect(searchShortcutOf(press("/", { shiftKey: true }))).toBe("open")
  })

  it("leaves / to a field or an editable element being typed in", () => {
    for (const target of [field("INPUT"), field("TEXTAREA"), field("SELECT"), editable]) {
      expect(searchShortcutOf(press("/", { target }))).toBeNull()
    }
  })

  it("leaves / with ⌘, Ctrl or Alt to the page", () => {
    expect(searchShortcutOf(press("/", { metaKey: true }))).toBeNull()
    expect(searchShortcutOf(press("/", { altKey: true }))).toBeNull()
  })

  it("leaves a key to an input method composing a character", () => {
    expect(searchShortcutOf(press("k", { metaKey: true, isComposing: true }))).toBeNull()
    expect(searchShortcutOf(press("/", { isComposing: true }))).toBeNull()
  })
})
