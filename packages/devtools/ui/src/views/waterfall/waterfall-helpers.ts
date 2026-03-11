import type { RequestEntry } from "../../store"

// ── Segment colors ──────────────────────────────────────────────────────────

export const SEGMENT_COLORS: Record<string, { bg: string; label: string }> = {
  queued: { bg: "bg-zinc-500", label: "Queued" },
  middleware_req: { bg: "bg-violet-500", label: "Middleware (req)" },
  fetch: { bg: "bg-sky-500", label: "HTTP Fetch" },
  middleware_res: { bg: "bg-violet-400", label: "Middleware (res)" },
  parse: { bg: "bg-amber-500", label: "Parse" },
  validation: { bg: "bg-emerald-500", label: "Validation" },
}

// ── Waterfall constants ─────────────────────────────────────────────────────

export const BASE_TIMELINE_WIDTH = 800
export const LABEL_COLUMN_WIDTH = 220
export const ZOOM_FACTOR = 1.5
export const MAX_ZOOM = 20
export const MIN_ZOOM = 0.5
export const TICK_SPACING_PX = 80

// ── Segment calculation ─────────────────────────────────────────────────────

export interface Segment {
  key: string
  start: number
  width: number
  color: string
  label: string
  duration: number
}

export function getSegments(r: RequestEntry, timelineStart: number): Segment[] {
  if (!r.timing) return []
  const offset = r.startedAt - timelineStart
  const { middleware, fetch, validation, total } = r.timing

  const middlewareReq = middleware / 2
  const middlewareRes = middleware / 2
  const parse = Math.max(0, total - middleware - fetch - validation)
  const segments: Segment[] = []
  let cursor = offset

  if (middlewareReq > 0) {
    segments.push({ key: "middleware_req", start: cursor, width: middlewareReq, color: SEGMENT_COLORS.middleware_req!.bg, label: "Middleware (req)", duration: middlewareReq })
    cursor += middlewareReq
  }
  if (fetch > 0) {
    segments.push({ key: "fetch", start: cursor, width: fetch, color: SEGMENT_COLORS.fetch!.bg, label: "HTTP Fetch", duration: fetch })
    cursor += fetch
  }
  if (parse > 0) {
    segments.push({ key: "parse", start: cursor, width: parse, color: SEGMENT_COLORS.parse!.bg, label: "Parse", duration: parse })
    cursor += parse
  }
  if (validation > 0) {
    segments.push({ key: "validation", start: cursor, width: validation, color: SEGMENT_COLORS.validation!.bg, label: "Validation", duration: validation })
    cursor += validation
  }
  if (middlewareRes > 0) {
    segments.push({ key: "middleware_res", start: cursor, width: middlewareRes, color: SEGMENT_COLORS.middleware_res!.bg, label: "Middleware (res)", duration: middlewareRes })
  }

  return segments
}
