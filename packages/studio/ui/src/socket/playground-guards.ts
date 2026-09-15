/**
 * Wire-boundary type guards for the rid-keyed playground wire. The Studio
 * server forwards `playground:chunk` / `playground:end` / `playground:error`
 * events from runtime responders; the Socket.IO client delivers them as
 * `unknown`, so these guards are the single trust boundary on the UI side.
 *
 * Shape reference: `packages/studio-core/src/runtime/responder-dispatch.ts`
 * — HTTP emits one `http-result` chunk, SSE emits repeated `sse-event`
 * chunks, WS emits repeated `ws-message` chunks, all keyed by the same rid
 * the UI stamped on `playground:exec`.
 *
 * If you add a new field to the wire format, update the matching type in
 * `store/types-ui.ts` AND the corresponding guard here.
 */

import type { PlaygroundChunk, PlaygroundEndSummary } from "@/store/types-ui"

/**
 * Reject objects whose own keys collide with `Object.prototype` slots so a
 * hostile sender cannot smuggle a `__proto__` / `constructor` / `prototype`
 * key through a downstream spread or merge. Mirrors the convention in
 * `binding-guards.ts` and the server-side sanitizers.
 */
function isPlainObject(raw: unknown): raw is Record<string, unknown> {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return false
  const proto = Object.getPrototypeOf(raw)
  if (proto !== Object.prototype && proto !== null) return false
  for (const key of Object.keys(raw)) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") return false
  }
  return true
}

function isRidCarrier(data: unknown): data is Record<string, unknown> {
  if (!isPlainObject(data)) return false
  if (typeof data.rid !== "string" || data.rid.length === 0) return false
  return true
}

function isValidChunk(value: unknown): value is PlaygroundChunk {
  if (!isPlainObject(value)) return false
  const kind = value.kind
  if (kind === "http-result") {
    if (typeof value.status !== "number" || !Number.isFinite(value.status)) return false
    if (value.error !== undefined && typeof value.error !== "string") return false
    // `data` is free-form unknown — accept as-is
    return true
  }
  if (kind === "sse-event") {
    // `event` is free-form unknown (responder forwards the yielded value)
    return "event" in value
  }
  if (kind === "ws-message") {
    return "data" in value
  }
  return false
}

export interface PlaygroundChunkPayload {
  rid: string
  chunk: PlaygroundChunk
}

export function isPlaygroundChunkPayload(data: unknown): data is PlaygroundChunkPayload {
  if (!isRidCarrier(data)) return false
  return isValidChunk(data.chunk)
}

export interface PlaygroundEndPayload {
  rid: string
  summary: PlaygroundEndSummary
}

export function isPlaygroundEndPayload(data: unknown): data is PlaygroundEndPayload {
  if (!isRidCarrier(data)) return false
  const summary = data.summary
  if (!isPlainObject(summary)) return false
  if (typeof summary.durationMs !== "number" || !Number.isFinite(summary.durationMs)) return false
  if (summary.count !== undefined) {
    if (typeof summary.count !== "number" || !Number.isFinite(summary.count)) return false
  }
  return true
}

export interface PlaygroundErrorPayload {
  rid: string
  error: { message: string }
}

export function isPlaygroundErrorPayload(data: unknown): data is PlaygroundErrorPayload {
  if (!isRidCarrier(data)) return false
  const error = data.error
  if (!isPlainObject(error)) return false
  if (typeof error.message !== "string") return false
  return true
}
