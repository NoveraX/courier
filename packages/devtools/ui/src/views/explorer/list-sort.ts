import type { ListSortKey, ListSortDir } from "../../store"
import type { FlatEndpoint } from "./helpers"

export function sortEndpoints(
  endpoints: FlatEndpoint[],
  key: ListSortKey,
  dir: ListSortDir
): FlatEndpoint[] {
  const sorted = [...endpoints]
  const m = dir === "asc" ? 1 : -1

  sorted.sort((a, b) => {
    switch (key) {
      case "source":
        return a.source.localeCompare(b.source) * m
      case "group":
        return a.group.localeCompare(b.group) * m
      case "method":
        return a.method.localeCompare(b.method) * m
      case "type":
        return a.type.localeCompare(b.type) * m
      case "middleware":
        return (a.middleware.length - b.middleware.length) * m
      case "schemas": {
        const aCount = (a.hasVariablesSchema ? 1 : 0) + (a.hasResponseSchema ? 1 : 0)
        const bCount = (b.hasVariablesSchema ? 1 : 0) + (b.hasResponseSchema ? 1 : 0)
        return (aCount - bCount) * m
      }
      default:
        return 0
    }
  })

  return sorted
}
