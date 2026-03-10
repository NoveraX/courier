import type { RequestEntry, RequestStatus } from "../../store"

// ── Filter Types ─────────────────────────────────────────────────────────────

export interface Filters {
  search: string
  status: RequestStatus[]
  mode: ("direct" | "proxy")[]
  type: ("query" | "mutation")[]
  httpMethod: string[]
  source: string[]
  group: string[]
  minDuration: number | null
}

export const EMPTY_FILTERS: Filters = {
  search: "",
  status: [],
  mode: [],
  type: [],
  httpMethod: [],
  source: [],
  group: [],
  minDuration: null,
}

// ── Filter Logic ─────────────────────────────────────────────────────────────

export function hasActiveFilters(f: Filters): boolean {
  return (
    f.search !== "" ||
    f.status.length > 0 ||
    f.mode.length > 0 ||
    f.type.length > 0 ||
    f.httpMethod.length > 0 ||
    f.source.length > 0 ||
    f.group.length > 0 ||
    f.minDuration !== null
  )
}

export function countActiveFilters(f: Filters): number {
  return [
    f.status.length,
    f.mode.length,
    f.type.length,
    f.httpMethod.length,
    f.source.length,
    f.group.length,
    f.minDuration !== null ? 1 : 0,
  ].reduce((a, b) => a + b, 0)
}

export function filterRequests(requests: RequestEntry[], filters: Filters): RequestEntry[] {
  return requests.filter((r) => {
    if (filters.search) {
      const q = filters.search.toLowerCase()
      const label = [r.source, r.group, r.method].filter(Boolean).join(".").toLowerCase()
      const url = (r.url ?? "").toLowerCase()
      if (
        !label.includes(q) &&
        !url.includes(q) &&
        !String(r.statusCode ?? "").includes(q)
      )
        return false
    }

    if (filters.status.length > 0 && !filters.status.includes(r.status)) return false
    if (filters.mode.length > 0 && !filters.mode.includes(r.mode)) return false
    if (filters.type.length > 0 && (!r.type || !filters.type.includes(r.type))) return false
    if (
      filters.httpMethod.length > 0 &&
      (!r.httpMethod || !filters.httpMethod.includes(r.httpMethod))
    )
      return false
    if (filters.source.length > 0 && !filters.source.includes(r.source)) return false
    if (
      filters.group.length > 0 &&
      (!r.group || !filters.group.includes(r.group))
    )
      return false
    if (
      filters.minDuration !== null &&
      (!r.timing || r.timing.total < filters.minDuration)
    )
      return false

    return true
  })
}
