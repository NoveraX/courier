import { useCallback, useSyncExternalStore } from "react";

/**
 * Whether a media query matches, kept up to date as it changes. Without
 * `matchMedia` — a test, a render on a server — nothing matches, so a view
 * keeps the layout it has on a desktop.
 *
 * @param query - A media query, such as one of `MEDIA`
 * @returns `true` while it matches
 * @example
 * ```tsx
 * const phone = useMediaQuery(MEDIA.phone);
 * ```
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (changed: () => void) => {
      if (typeof window.matchMedia !== "function") return () => {};
      const list = window.matchMedia(query);
      list.addEventListener("change", changed);
      return () => list.removeEventListener("change", changed);
    },
    [query],
  );
  const matches = useCallback(
    () => typeof window.matchMedia === "function" && window.matchMedia(query).matches,
    [query],
  );
  return useSyncExternalStore(subscribe, matches, () => false);
}
