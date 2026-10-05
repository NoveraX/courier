import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(changed: () => void): () => void {
  if (typeof window.matchMedia !== "function") return () => {};
  const query = window.matchMedia(QUERY);
  query.addEventListener("change", changed);
  return () => query.removeEventListener("change", changed);
}

function reduced(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia(QUERY).matches;
}

/**
 * Whether the reader asked the system for less motion, kept up to date as
 * the setting changes.
 *
 * @returns `true` while less motion is asked for
 * @example
 * ```tsx
 * const still = useReducedMotion();
 * ```
 */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, reduced, () => false);
}
