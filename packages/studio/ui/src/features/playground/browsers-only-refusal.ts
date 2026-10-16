import type { PlaygroundHistoryEntry } from "@/store/types-ui";

/**
 * Whether a Proxy-mode run was refused by the app's `browsersOnly`: a 403
 * whose body names `BROWSERS_ONLY`. Studio's runtime sends a one-time pass
 * that lets such a call through; a refusal means nothing redeemed it.
 *
 * @param entry - The run shown, if any
 * @returns `true` for the refusal
 * @example
 * ```ts
 * refusedByBrowsersOnly({ ...entry, mode: "proxy", statusCode: 403, response: { code: "BROWSERS_ONLY" } }); // → true
 * ```
 */
export function refusedByBrowsersOnly(entry: PlaygroundHistoryEntry | null): boolean {
  if (entry?.mode !== "proxy" || entry.transport || entry.statusCode !== 403) return false;
  const { response } = entry;
  if (typeof response !== "object" || response === null) return false;
  return Reflect.get(response, "code") === "BROWSERS_ONLY";
}
