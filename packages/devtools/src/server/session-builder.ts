/**
 * Build a SavedSession from in-memory request events and session metadata.
 */

import { randomUUID } from "node:crypto";
import type { SavedRequest, SavedSession, SavedSessionApp, SessionStats } from "./session-types";

/** Convert a raw request entry (from UI store format) to SavedRequest */
function toSavedRequest(raw: Record<string, unknown>): SavedRequest {
  return {
    id: String(raw["id"] ?? ""),
    source: String(raw["source"] ?? ""),
    group: raw["group"] != null ? String(raw["group"]) : undefined,
    method: String(raw["method"] ?? ""),
    httpMethod: raw["httpMethod"] != null ? String(raw["httpMethod"]) : undefined,
    variables: raw["variables"],
    mode: raw["mode"] === "proxy" ? "proxy" : "direct",
    type: raw["type"] === "mutation" ? "mutation" : raw["type"] === "query" ? "query" : undefined,
    status: String(raw["status"] ?? "pending"),
    statusCode: typeof raw["statusCode"] === "number" ? raw["statusCode"] : undefined,
    timing: raw["timing"] as Record<string, number> | undefined,
    size: typeof raw["size"] === "number" ? raw["size"] : undefined,
    data: raw["data"],
    requestHeaders: raw["requestHeaders"] as Record<string, string> | undefined,
    responseHeaders: raw["headers"] as Record<string, string> | undefined,
    error: raw["error"] as SavedRequest["error"],
    startedAt: typeof raw["startedAt"] === "number" ? raw["startedAt"] : Date.now(),
    url: raw["url"] != null ? String(raw["url"]) : undefined,
    sessionId: String(raw["sessionId"] ?? ""),
  };
}

/** Compute session stats from requests */
function computeStats(requests: SavedRequest[]): SessionStats {
  const successCount = requests.filter((r) => r.status === "success").length;
  const errorCount = requests.filter(
    (r) => r.status === "error" || r.status === "validation_error",
  ).length;

  const durations = requests
    .map((r) => r.timing?.["total"])
    .filter((d): d is number => typeof d === "number");

  const avgDuration =
    durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;

  const totalSize = requests.reduce((sum, r) => sum + (r.size ?? 0), 0);

  return { totalRequests: requests.length, successCount, errorCount, avgDuration, totalSize };
}

export interface BuildSessionInput {
  name?: string;
  requests: Record<string, unknown>[];
  apps: SavedSessionApp[];
}

/** Build a SavedSession from raw UI data */
export function buildSession(input: BuildSessionInput): SavedSession {
  const requests = input.requests.map(toSavedRequest);
  const startTimes = requests.map((r) => r.startedAt).filter((t) => t > 0);
  const startedAt = startTimes.length > 0 ? Math.min(...startTimes) : Date.now();
  const endedAt = startTimes.length > 0 ? Math.max(...startTimes) : Date.now();

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
    savedAt: Date.now(),
    startedAt,
    duration: endedAt - startedAt,
    apps: input.apps,
    requests,
    stats: computeStats(requests),
  };
}
