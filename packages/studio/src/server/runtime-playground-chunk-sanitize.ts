/**
 * Checks for what a runtime answers a Playground call with, before it is
 * passed on to the UI: its result chunks, its end and its error.
 */

import { hasDangerousKeys } from "./has-dangerous-keys";
import { isPlainObject } from "./is-plain-object";

export type SanitizedChunk =
  | {
      kind: "http-result";
      status: number;
      data?: unknown;
      error?: string;
      headers?: Record<string, string>;
    }
  | { kind: "sse-event"; event: unknown }
  | { kind: "ws-message"; data: unknown }
  | { kind: "ws-open" }
  | { kind: "upload-progress"; loaded: number; total: number; percentage: number };

export interface SanitizedChunkPayload {
  rid: string;
  chunk: SanitizedChunk;
}

export interface SanitizedEndPayload {
  rid: string;
  summary: { durationMs: number; count?: number };
}

export interface SanitizedErrorPayload {
  rid: string;
  error: { message: string };
}

function sanitizeChunkInner(raw: unknown): SanitizedChunk | null {
  if (!isPlainObject(raw) || hasDangerousKeys(raw)) return null;
  if (raw.kind === "http-result") {
    if (typeof raw.status !== "number" || !Number.isFinite(raw.status)) return null;
    return {
      kind: "http-result",
      status: raw.status,
      data: raw.data,
      ...(typeof raw.error === "string" && { error: raw.error }),
      ...(isStringRecord(raw.headers) && { headers: raw.headers }),
    };
  }
  if (raw.kind === "sse-event") {
    if (!("event" in raw)) return null;
    return { kind: "sse-event", event: raw.event };
  }
  if (raw.kind === "ws-message") {
    if (!("data" in raw)) return null;
    return { kind: "ws-message", data: raw.data };
  }
  if (raw.kind === "ws-open") return { kind: "ws-open" };
  if (raw.kind === "upload-progress") {
    const { loaded, total, percentage } = raw;
    if (!isCount(loaded) || !isCount(total) || !isCount(percentage)) return null;
    return { kind: "upload-progress", loaded, total, percentage };
  }
  return null;
}

/* Response headers, as the Playground shows them: names to string values. */
function isStringRecord(value: unknown): value is Record<string, string> {
  if (!isPlainObject(value) || hasDangerousKeys(value)) return false;
  return Object.values(value).every((entry) => typeof entry === "string");
}

export function sanitizeChunk(raw: unknown): SanitizedChunkPayload | null {
  if (!isPlainObject(raw)) return null;
  if (typeof raw.rid !== "string" || raw.rid.length === 0) return null;
  const chunk = sanitizeChunkInner(raw.chunk);
  if (!chunk) return null;
  return { rid: raw.rid, chunk };
}

export function sanitizeEnd(raw: unknown): SanitizedEndPayload | null {
  if (!isPlainObject(raw)) return null;
  if (typeof raw.rid !== "string" || raw.rid.length === 0) return null;
  if (!isPlainObject(raw.summary)) return null;
  const s = raw.summary;
  if (typeof s.durationMs !== "number" || !Number.isFinite(s.durationMs)) return null;
  const summary: SanitizedEndPayload["summary"] = { durationMs: s.durationMs };
  if (typeof s.count === "number" && Number.isFinite(s.count)) summary.count = s.count;
  return { rid: raw.rid, summary };
}

export function sanitizeError(raw: unknown): SanitizedErrorPayload | null {
  if (!isPlainObject(raw)) return null;
  if (typeof raw.rid !== "string" || raw.rid.length === 0) return null;
  if (!isPlainObject(raw.error)) return null;
  if (typeof raw.error.message !== "string") return null;
  return { rid: raw.rid, error: { message: raw.error.message } };
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}
