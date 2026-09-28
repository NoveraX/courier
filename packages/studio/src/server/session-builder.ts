/**
 * Build a SavedSession from the requests the UI captured and session metadata.
 */

import { randomUUID } from "node:crypto";
import type { SavedRequest, SavedSession, SavedSessionApp, SessionStats } from "./session-types";
import { isObject } from "./validate-body";

function optionalString(value: unknown): string | undefined {
  return value != null ? String(value) : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

/* An object whose every value is of one type, or nothing. */
function recordOf<TValue>(
  value: unknown,
  is: (item: unknown) => item is TValue,
): Record<string, TValue> | undefined {
  if (!isObject(value)) return undefined;
  const record: Record<string, TValue> = {};
  for (const [key, item] of Object.entries(value)) {
    if (!is(item)) return undefined;
    record[key] = item;
  }
  return record;
}

const isNumber = (item: unknown): item is number => typeof item === "number";
const isString = (item: unknown): item is string => typeof item === "string";

function errorOf(value: unknown): SavedRequest["error"] {
  if (!isObject(value) || typeof value.message !== "string") return undefined;
  const status = optionalNumber(value.status);
  return {
    type: String(value.type ?? "unknown"),
    ...(status !== undefined && { status }),
    message: value.message,
  };
}

/** Convert a request as the UI store keeps it to SavedRequest */
function toSavedRequest(raw: Record<string, unknown>): SavedRequest {
  return {
    id: String(raw.id ?? ""),
    source: String(raw.source ?? ""),
    group: optionalString(raw.group),
    method: String(raw.method ?? ""),
    httpMethod: optionalString(raw.httpMethod),
    variables: raw.variables,
    mode: raw.mode === "proxy" ? "proxy" : "direct",
    type: raw.type === "mutation" ? "mutation" : raw.type === "query" ? "query" : undefined,
    status: String(raw.status ?? "pending"),
    statusCode: optionalNumber(raw.statusCode),
    timing: recordOf(raw.timing, isNumber),
    size: optionalNumber(raw.size),
    data: raw.data,
    requestHeaders: recordOf(raw.requestHeaders, isString),
    responseHeaders: recordOf(raw.headers ?? raw.responseHeaders, isString),
    error: errorOf(raw.error),
    startedAt: optionalNumber(raw.startedAt) ?? Date.now(),
    url: optionalString(raw.url),
    sessionId: String(raw.sessionId ?? ""),
  };
}

/** Compute session stats from requests */
function computeStats(requests: SavedRequest[]): SessionStats {
  const successCount = requests.filter((r) => r.status === "success").length;
  const errorCount = requests.filter(
    (r) => r.status === "error" || r.status === "validation_error",
  ).length;

  const durations = requests
    .map((r) => r.timing?.total)
    .filter((d): d is number => typeof d === "number");

  const avgDuration =
    durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;

  const totalSize = requests.reduce((sum, r) => sum + (r.size ?? 0), 0);

  return { totalRequests: requests.length, successCount, errorCount, avgDuration, totalSize };
}

/* The first and last start time, read in one pass: spreading thousands of them into Math.min overflows the stack. */
function spanOf(requests: SavedRequest[]): { first: number; last: number } | null {
  let span: { first: number; last: number } | null = null;
  for (const { startedAt } of requests) {
    if (startedAt <= 0) continue;
    span =
      span === null
        ? { first: startedAt, last: startedAt }
        : {
            first: Math.min(span.first, startedAt),
            last: Math.max(span.last, startedAt),
          };
  }
  return span;
}

export interface BuildSessionInput {
  name?: string;
  requests: Record<string, unknown>[];
  apps: SavedSessionApp[];
}

/**
 * Build a SavedSession from the requests the UI captured.
 *
 * @param input - The session's name, if given, its requests and its apps
 * @returns The session, with a fresh id and its stats
 * @example
 * ```ts
 * saveSession(buildSession({ name: "login flow", requests, apps: [] }));
 * ```
 */
export function buildSession(input: BuildSessionInput): SavedSession {
  const requests = input.requests.map(toSavedRequest);
  const now = Date.now();
  const span = spanOf(requests) ?? { first: now, last: now };

  const id = randomUUID().slice(0, 8);
  const defaultName = `Session ${new Date().toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })}`;

  return {
    id,
    name: input.name ?? defaultName,
    savedAt: now,
    startedAt: span.first,
    duration: span.last - span.first,
    apps: input.apps,
    requests,
    stats: computeStats(requests),
  };
}
