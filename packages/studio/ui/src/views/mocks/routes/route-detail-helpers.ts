/**
 * Helpers the mock route detail tabs share: the operation-name inference and
 * the latency colour.
 */

import type { MockRouteEntry } from "@/store/mock-slice";

/** Best-effort conversion from HTTP method + path to a CRUD-style operation name. */
export function inferOperation(route: MockRouteEntry): string {
  const method = route.httpMethod.toUpperCase();
  const hasIdParam = route.fullPath.includes(":");
  if (method === "GET") return hasIdParam ? "getById" : "list";
  if (method === "POST") return "create";
  if (method === "PUT" || method === "PATCH") return "update";
  if (method === "DELETE") return "delete";
  return method.toLowerCase();
}

/** Color class for a latency value, matching the studio status palette. */
export function latencyColorClass(ms: number): string {
  if (ms > 1000) return "text-rose-400";
  if (ms > 300) return "text-amber-400";
  if (ms > 0) return "text-emerald-400";
  return "text-muted-foreground";
}
