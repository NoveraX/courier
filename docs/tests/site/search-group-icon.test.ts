/**
 * Each group of search results is headed with its section's icon from the
 * navigation — the API reference's exports with the API Reference
 * section's, as they are listed under it — the results opened lately with
 * a clock, and a section the navigation does not have with a book.
 */
import { BookOpen, Clock, Code2 } from "lucide-react"
import { describe, expect, it } from "vitest"

import { API_SECTION } from "@/site/content/nav-reference"
import { groupIcon } from "@/site/search/group-icon"
import { RECENT_GROUP } from "@/site/search/search-view"

const group = (id: string, label: string) => ({ id, label, options: [] })

describe("the icon a group of results is headed with", () => {
  it("is its section's icon in the navigation", () => {
    expect(groupIcon(group(`section:${API_SECTION}`, API_SECTION))).toBe(Code2)
  })

  it("is a clock for the results opened lately", () => {
    expect(groupIcon(group(RECENT_GROUP, "Recent"))).toBe(Clock)
  })

  it("is a book for a section the navigation does not have", () => {
    expect(groupIcon(group("section:Documentation", "Documentation"))).toBe(BookOpen)
  })
})
