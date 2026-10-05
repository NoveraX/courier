import type { RequestEntry } from "@/store/types";

/** How a call ended, as the status breakdown groups it. */
export type StatusGroupKey = "success" | "client" | "server" | "validation" | "aborted" | "other";

/** One group of the status breakdown. */
export interface StatusGroup {
  key: StatusGroupKey;
  label: string;
  count: number;
  /** Its share of the calls, 0–1. */
  share: number;
}

/* The groups the breakdown always lists, in its order; "other" joins them when it has calls. */
const GROUPS: readonly { key: StatusGroupKey; label: string }[] = [
  { key: "success", label: "Success" },
  { key: "client", label: "4xx client" },
  { key: "server", label: "5xx server" },
  { key: "validation", label: "Validation" },
  { key: "aborted", label: "Aborted" },
  { key: "other", label: "Other errors" },
];

/**
 * The group a call falls in: it succeeded, broke its schema or was cut
 * short; or it failed with a 4xx or 5xx — any other failure, such as one
 * that got no response at all, is among the other errors.
 *
 * @param r - The call
 * @returns Its group
 * @example
 * ```ts
 * statusGroupOf({ status: "error", statusCode: 503 }); // "server"
 * ```
 */
export function statusGroupOf(r: Pick<RequestEntry, "status" | "statusCode">): StatusGroupKey {
  if (r.status === "success") return "success";
  if (r.status === "validation_error") return "validation";
  if (r.status === "aborted") return "aborted";
  const code = r.statusCode ?? 0;
  if (code >= 500) return "server";
  return code >= 400 ? "client" : "other";
}

/**
 * How the calls ended, by group, with each group's share. Every group is
 * listed, empty or not, except the other errors, listed only when there
 * are some — so the shares always add up to the whole.
 *
 * @param done - The finished calls
 * @returns The groups, in the breakdown's order
 * @example
 * ```ts
 * statusBreakdown(win.done)[0]; // { key: "success", label: "Success", count: 182, share: 0.919 }
 * ```
 */
export function statusBreakdown(done: readonly RequestEntry[]): StatusGroup[] {
  const counts = new Map<StatusGroupKey, number>();
  for (const r of done) {
    const key = statusGroupOf(r);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const total = Math.max(1, done.length);
  return GROUPS.flatMap(({ key, label }) => {
    const count = counts.get(key) ?? 0;
    if (key === "other" && count === 0) return [];
    return [{ key, label, count, share: count / total }];
  });
}
