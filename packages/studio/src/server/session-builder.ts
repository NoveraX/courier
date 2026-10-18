/**
 * Build a SavedSession from the requests the UI captured and session metadata.
 */

import { randomUUID } from "node:crypto";

import type { SavedRequest, SavedSession, SavedSessionApp, SessionStats } from "./session-types";
import { toSavedRequest } from "./to-saved-request";

/* The figures of the requests sent: a read another call's request answered sent none, and holds that request's answer. */
function computeStats(calls: SavedRequest[]): SessionStats {
  const sent = calls.filter((r) => r.shared === undefined);
  const successCount = sent.filter((r) => r.status === "success").length;
  const errorCount = sent.filter(
    (r) => r.status === "error" || r.status === "validation_error",
  ).length;

  const durations = sent
    .map((r) => r.timing?.total)
    .filter((d): d is number => typeof d === "number");

  const avgDuration =
    durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;

  const totalSize = sent.reduce((sum, r) => sum + (r.size ?? 0), 0);

  return {
    totalRequests: sent.length,
    totalCalls: calls.length,
    successCount,
    errorCount,
    avgDuration,
    totalSize,
  };
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
